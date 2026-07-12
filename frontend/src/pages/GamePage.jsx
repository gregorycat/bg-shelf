import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import { useLibraryStore } from '../stores/useLibraryStore.js'
import { useBggStore } from '../stores/useBggStore.js'
import { games as gamesApi, loans as loansApi, friends as friendsApi, plays as playsApi, bgg as bggApi } from '../services/api.js'
import ScoreSheetBuilder from '../components/ScoreSheetBuilder.jsx'
import { parseJsonArray } from '../utils/json.js'
import styles from './GamePage.module.css'

marked.setOptions({ breaks: true })

const EMPTY_PLAYER = { player_name: '', score: '', winner: false, score_data: {} }

export default function GamePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const playLogRef = useRef(null)
  const { games, fetch: fetchAll, updateGame, removeGame, refreshGame } = useLibraryStore()
  const { loggedIn } = useBggStore()

  const [friends, setFriends] = useState([])
  const [loanHistory, setLoanHistory] = useState([])
  const [lendTo, setLendTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoFetching, setAutoFetching] = useState(false)
  const [msg, setMsg] = useState(null)
  const [youtubeId, setYoutubeId] = useState(null)
  const [videoLoading, setVideoLoading] = useState(false)

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [removeBgg, setRemoveBgg] = useState(false)

  // Scoring guide
  const [guideEdit, setGuideEdit] = useState(false)
  const [guideDraft, setGuideDraft] = useState('')
  const [guideSaving, setGuideSaving] = useState(false)
  const [guideGenerating, setGuideGenerating] = useState(false)
  const [guideInputPanel, setGuideInputPanel] = useState(false)
  const [rulesInput, setRulesInput] = useState('')

  // Strategy guide
  const [strategyEdit, setStrategyEdit] = useState(false)
  const [strategyDraft, setStrategyDraft] = useState('')
  const [strategySaving, setStrategySaving] = useState(false)
  const [strategyGenerating, setStrategyGenerating] = useState(false)

  // Play log
  const [playList, setPlayList] = useState([])
  const [showAddPlay, setShowAddPlay] = useState(false)
  const [playDate, setPlayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [playDuration, setPlayDuration] = useState('')
  const [playNotes, setPlayNotes] = useState('')
  const [playPlayers, setPlayPlayers] = useState([{ ...EMPTY_PLAYER }])
  const [playExpansionIds, setPlayExpansionIds] = useState([])
  const [playSaving, setPlaySaving] = useState(false)
  const [editingPlayId, setEditingPlayId] = useState(null)

  // Score sheet template builder
  const [sheetBuilderOpen, setSheetBuilderOpen] = useState(false)
  const [sheetDraft, setSheetDraft] = useState('')
  const [sheetSaving, setSheetSaving] = useState(false)

  // Ensure store is populated (handles direct URL navigation)
  useEffect(() => {
    if (games.length === 0) fetchAll()
  }, [])

  const game = games.find(g => g.id === id)

  const template = useMemo(() => {
    if (!game?.score_sheet_template) return null
    try { return JSON.parse(game.score_sheet_template) } catch { return null }
  }, [game?.score_sheet_template])

  // Auto-fetch full metadata from BGG on first visit (collection sync gives basic data only)
  useEffect(() => {
    if (!game || autoFetching) return
    if (!game.metadata_refreshed_at && game.bgg_id) {
      setAutoFetching(true)
      refreshGame(id)
        .catch(() => {})
        .finally(() => setAutoFetching(false))
    }
  }, [game?.id])

  useEffect(() => {
    if (!id) return
    friendsApi.list().then(setFriends)
    loansApi.history().then(all => setLoanHistory(all.filter(l => l.game_id === id)))
    setVideoLoading(true)
    gamesApi.howtoplay(id)
      .then(d => setYoutubeId(d.youtube_id))
      .catch(() => {})
      .finally(() => setVideoLoading(false))
    playsApi.list(id).then(setPlayList).catch(() => {})
  }, [id])

  // Deep-link from the Plays page: /library/:id?editPlay=<playId>
  useEffect(() => {
    const editPlayId = searchParams.get('editPlay')
    if (!editPlayId || playList.length === 0) return
    const target = playList.find(p => p.id === editPlayId)
    if (target) {
      startEditPlay(target)
      playLogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('editPlay')
      return next
    }, { replace: true })
  }, [playList, searchParams])

  if (games.length === 0) return <p style={{ color: 'var(--muted)', padding: 40 }}>Chargement…</p>
  if (!game) return <p style={{ color: 'var(--muted)', padding: 40 }}>Jeu introuvable.</p>

  const categories  = parseJsonArray(game.categories)
  const mechanics   = parseJsonArray(game.mechanics)
  const designers   = parseJsonArray(game.designers)
  const publishers  = parseJsonArray(game.publishers)
  const artists     = parseJsonArray(game.artists)
  const extensions  = games.filter(g => g.parent_game_id === id)

  // Merge the base game's score sheet with any checked expansions' own score sheets,
  // namespacing expansion field/section ids so they can't collide with the base game's.
  const selectedExpansionSheets = extensions
    .filter(e => playExpansionIds.includes(e.id) && e.score_sheet_template)
    .map(e => {
      try {
        const tmpl = JSON.parse(e.score_sheet_template)
        return tmpl.sections?.length ? { expansion: e, sections: tmpl.sections } : null
      } catch { return null }
    })
    .filter(Boolean)

  const playTemplate = (() => {
    const baseSections = template ? template.sections : []
    const expSections = selectedExpansionSheets.flatMap(({ expansion, sections }) =>
      sections.map(sec => ({
        ...sec,
        id: `ext_${expansion.id}_${sec.id}`,
        label: sec.label ? `${expansion.title} — ${sec.label}` : expansion.title,
        fields: sec.fields.map(f => ({ ...f, id: `ext_${expansion.id}_${f.id}` })),
      }))
    )
    if (!baseSections.length && !expSections.length) return null
    return { sections: [...baseSections, ...expSections] }
  })()

  const checkedExpansionsMissingSheet = extensions.filter(
    e => playExpansionIds.includes(e.id) && !e.score_sheet_template
  )

  const similarGames = (() => {
    if (!categories.length && !mechanics.length) return []
    const catSet = new Set(categories)
    const mechSet = new Set(mechanics)
    return games
      .filter(g => g.id !== id && g.bgg_type !== 'boardgameexpansion' && g.parent_game_id !== id)
      .map(g => {
        let score = 0
        const gCats = parseJsonArray(g.categories)
        const gMechs = parseJsonArray(g.mechanics)
        for (const c of gCats) if (catSet.has(c)) score += 2
        for (const m of gMechs) if (mechSet.has(m)) score += 1.5
        if (game.min_players && g.min_players && game.max_players && g.max_players) {
          if (Math.min(game.max_players, g.max_players) >= Math.max(game.min_players, g.min_players)) score += 1
        }
        if (game.weight && g.weight && Math.abs(game.weight - g.weight) <= 0.8) score += 1
        if (game.playing_time && g.playing_time && Math.abs(game.playing_time - g.playing_time) <= 30) score += 0.5
        return { ...g, _score: score }
      })
      .filter(g => g._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5)
  })()

  async function handleLend() {
    if (!lendTo) return
    setLoading(true)
    try {
      await loansApi.create({ game_id: id, friend_id: lendTo })
      await updateGame(id, { status: 'lent' })
      setMsg('Prêt enregistré.')
      loansApi.history().then(all => setLoanHistory(all.filter(l => l.game_id === id)))
    } catch {
      setMsg('Erreur lors du prêt.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setLoading(true)
    setMsg(null)
    try {
      await refreshGame(id)
      if (game.bgg_type === 'boardgameexpansion') fetchAll()
      setMsg('Métadonnées mises à jour depuis BGG.')
    } catch {
      setMsg('Erreur lors de la mise à jour.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      if (removeBgg && game.bgg_id) {
        try {
          await bggApi.removeFromCollection(game.bgg_id)
        } catch (err) {
          setMsg(`Suppression BGG échouée : ${err.response?.data?.error || err.message}`)
        }
      }
      await removeGame(id)
      navigate('/library')
    } finally {
      setLoading(false)
    }
  }

  function startGuideEdit() {
    setGuideDraft(game.scoring_guide || '')
    setGuideEdit(true)
  }

  async function generateGuide() {
    setGuideGenerating(true)
    try {
      const { text } = await gamesApi.generateScoringGuide(id, rulesInput)
      setGuideDraft(text)
      setGuideEdit(true)
      setGuideInputPanel(false)
      setRulesInput('')
    } catch (err) {
      alert(err?.response?.data?.error || 'Erreur lors de la génération.')
    } finally {
      setGuideGenerating(false)
    }
  }

  function cancelGeneratePanel() {
    setGuideInputPanel(false)
    setRulesInput('')
  }

  async function saveGuide() {
    setGuideSaving(true)
    try {
      await updateGame(id, { scoring_guide: guideDraft })
      setGuideEdit(false)
    } finally {
      setGuideSaving(false)
    }
  }

  function startStrategyEdit() {
    setStrategyDraft(game.strategy_guide || '')
    setStrategyEdit(true)
  }

  async function generateStrategy() {
    setStrategyGenerating(true)
    try {
      const { text } = await gamesApi.generateStrategyGuide(id)
      setStrategyDraft(text)
      setStrategyEdit(true)
    } catch (err) {
      alert(err?.response?.data?.error || 'Erreur lors de la génération.')
    } finally {
      setStrategyGenerating(false)
    }
  }

  async function saveStrategy() {
    setStrategySaving(true)
    try {
      await updateGame(id, { strategy_guide: strategyDraft })
      setStrategyEdit(false)
    } finally {
      setStrategySaving(false)
    }
  }

  function updatePlayer(i, field, value) {
    setPlayPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  function updatePlayerField(i, fieldId, value) {
    setPlayPlayers(prev => prev.map((p, idx) =>
      idx === i ? { ...p, score_data: { ...p.score_data, [fieldId]: value } } : p
    ))
  }

  function togglePlayExpansion(expansionId) {
    setPlayExpansionIds(prev =>
      prev.includes(expansionId) ? prev.filter(id => id !== expansionId) : [...prev, expansionId]
    )
  }

  function resetPlayForm() {
    setShowAddPlay(false)
    setEditingPlayId(null)
    setPlayDate(new Date().toISOString().slice(0, 10))
    setPlayDuration('')
    setPlayNotes('')
    setPlayPlayers([{ ...EMPTY_PLAYER }])
    setPlayExpansionIds([])
  }

  function startEditPlay(play) {
    setEditingPlayId(play.id)
    setPlayDate(play.played_at.slice(0, 10))
    setPlayDuration(play.duration_min ? String(play.duration_min) : '')
    setPlayNotes(play.notes || '')
    setPlayPlayers(
      play.players.length
        ? play.players.map(p => ({
            player_name: p.player_name,
            score: p.score ?? '',
            winner: !!p.winner,
            score_data: p.score_data ? JSON.parse(p.score_data) : {},
          }))
        : [{ ...EMPTY_PLAYER }]
    )
    setPlayExpansionIds((play.expansions || []).map(e => e.id))
    setShowAddPlay(true)
  }

  function computeTotal(player, sections) {
    let total = 0
    for (const sec of sections) {
      for (const f of sec.fields) {
        const raw = player.score_data?.[f.id]
        if (f.type === 'number') total += (parseFloat(raw) || 0) * (f.multiplier || 1)
        else if (f.type === 'checkbox') total += raw ? (f.points || 0) : 0
      }
    }
    return total
  }

  async function saveSheet() {
    setSheetSaving(true)
    try {
      await updateGame(id, { score_sheet_template: sheetDraft })
      setSheetBuilderOpen(false)
    } catch (err) {
      alert(err?.response?.data?.error || 'Erreur lors de la sauvegarde.')
    } finally {
      setSheetSaving(false)
    }
  }

  async function submitPlay() {
    const validPlayers = playPlayers.filter(p => p.player_name.trim())
    setPlaySaving(true)
    try {
      const payload = {
        played_at: playDate,
        duration_min: playDuration ? Number(playDuration) : null,
        notes: playNotes || null,
        players: validPlayers.map(p => {
          const score = playTemplate
            ? computeTotal(p, playTemplate.sections)
            : (p.score !== '' ? Number(p.score) : null)
          return {
            player_name: p.player_name.trim(),
            score,
            winner: p.winner,
            score_data: playTemplate ? JSON.stringify(p.score_data) : null,
          }
        }),
        expansion_ids: playExpansionIds,
      }
      if (editingPlayId) {
        const updatedPlay = await playsApi.update(editingPlayId, payload)
        setPlayList(prev => prev.map(p => p.id === editingPlayId ? updatedPlay : p))
      } else {
        const newPlay = await playsApi.create({ game_id: id, ...payload })
        setPlayList(prev => [newPlay, ...prev])
      }
      resetPlayForm()
    } finally {
      setPlaySaving(false)
    }
  }

  async function deletePlay(playId) {
    if (!confirm('Supprimer cette partie ?')) return
    await playsApi.remove(playId)
    setPlayList(prev => prev.filter(p => p.id !== playId))
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>← Retour</button>

      {autoFetching && (
        <p className={styles.autoFetch}>Chargement des détails depuis BGG…</p>
      )}

      <div className={styles.layout}>
        <div className={styles.cover}>
          {game.image_url || game.thumbnail_url
            ? <img src={game.image_url || game.thumbnail_url} alt={game.title} />
            : <span className={styles.coverPlaceholder}>{game.title.slice(0, 2).toUpperCase()}</span>
          }
        </div>

        <div className={styles.detail}>
          <div className={styles.titleRow}>
            <h1>{game.title}</h1>
            {game.bgg_type === 'boardgameexpansion' && (
              <span className={styles.extBadge}>Extension</span>
            )}
          </div>

          <div className={styles.chips}>
            {game.min_players && game.max_players && (
              <span className={styles.chip}>👥 {game.min_players}–{game.max_players} joueurs</span>
            )}
            {(game.min_playtime || game.playing_time) && (
              <span className={styles.chip}>
                ⏱ {game.min_playtime && game.max_playtime && game.min_playtime !== game.max_playtime
                  ? `${game.min_playtime}–${game.max_playtime}`
                  : game.playing_time} min
              </span>
            )}
            {game.bgg_rating && (
              <span className={styles.chip}>★ {game.bgg_rating.toFixed(1)}{game.num_ratings ? ` (${game.num_ratings.toLocaleString('fr-FR')})` : ''}</span>
            )}
            {game.weight && (
              <span className={styles.chip} title="Complexité BGG (1–5)">⚖ {game.weight.toFixed(1)}/5</span>
            )}
            {game.age && (
              <span className={styles.chip}>🔞 {game.age}+</span>
            )}
            {game.bgg_rank && (
              <span className={styles.chip}>🏆 #{game.bgg_rank}</span>
            )}
            {game.year_published && (
              <span className={styles.chip}>{game.year_published}</span>
            )}
          </div>

          {msg && <p className={styles.msg}>{msg}</p>}

          <div className={styles.actions}>
            {game.status === 'owned' && game.bgg_type === 'boardgame' && (
              <div className={styles.lendRow}>
                <select value={lendTo} onChange={e => setLendTo(e.target.value)}>
                  <option value="">Prêter à…</option>
                  {friends.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button className="btn btn-primary" onClick={handleLend} disabled={!lendTo || loading}>
                  Prêter
                </button>
              </div>
            )}
            {game.status === 'lent' && (
              <span className={styles.lentNote}>Ce jeu est actuellement prêté.</span>
            )}
            <button className="btn btn-ghost" onClick={handleRefresh} disabled={loading || autoFetching || !game.bgg_id}>
              Actualiser depuis BGG
            </button>
            {!showDeleteConfirm ? (
              <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>Supprimer</button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.deleteQuestion}>Supprimer « {game.title} » de la bibliothèque ?</p>
                {loggedIn && game.bgg_id && (
                  <label className={styles.deleteBggCheck}>
                    <input type="checkbox" checked={removeBgg} onChange={e => setRemoveBgg(e.target.checked)} />
                    Supprimer aussi de ma collection BGG
                  </label>
                )}
                <div className={styles.deleteActions}>
                  <button className="btn btn-ghost" onClick={() => { setShowDeleteConfirm(false); setRemoveBgg(false) }}>
                    Annuler
                  </button>
                  <button className="btn btn-danger" onClick={handleDelete} disabled={loading}>
                    {loading ? 'Suppression…' : 'Confirmer'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {designers.length > 0 && (
            <>
              <div className={styles.label}>Designer{designers.length > 1 ? 's' : ''}</div>
              <p className={styles.infoLine}>{designers.join(', ')}</p>
            </>
          )}

          {publishers.length > 0 && (
            <>
              <div className={styles.label}>Éditeur{publishers.length > 1 ? 's' : ''}</div>
              <p className={styles.infoLine}>{publishers.slice(0, 3).join(', ')}{publishers.length > 3 ? '…' : ''}</p>
            </>
          )}

          {artists.length > 0 && (
            <>
              <div className={styles.label}>Illustrateur{artists.length > 1 ? 's' : ''}</div>
              <p className={styles.infoLine}>{artists.slice(0, 3).join(', ')}{artists.length > 3 ? '…' : ''}</p>
            </>
          )}

          {game.language_dep && (
            <>
              <div className={styles.label}>Dépendance à la langue</div>
              <p className={styles.infoLine}>{game.language_dep}</p>
            </>
          )}

          {categories.length > 0 && (
            <>
              <div className={styles.label}>Catégories</div>
              <div className={styles.tags}>
                {categories.map(t => <span key={t} className={styles.tag}>{t}</span>)}
              </div>
            </>
          )}

          {mechanics.length > 0 && (
            <>
              <div className={styles.label}>Mécaniques</div>
              <div className={styles.tags}>
                {mechanics.map(t => <span key={t} className={styles.tag}>{t}</span>)}
              </div>
            </>
          )}

          <div className={styles.label}>Règles</div>
          {videoLoading && <p className={styles.videoHint}>Recherche d'une vidéo de règles…</p>}
          {!videoLoading && youtubeId && (
            <div className={styles.videoWrap}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
                title="Règles du jeu"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          )}
          {!videoLoading && !youtubeId && (
            <a
              className={styles.videoFallback}
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(game.title + ' how to play règles')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              ▶ Chercher « {game.title} how to play » sur YouTube
            </a>
          )}

          {/* Scoring guide */}
          <div className={styles.sectionHeader}>
            <div className={styles.label}>Calcul des scores</div>
            {!guideEdit && !guideInputPanel && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={styles.editBtn}
                  onClick={() => setGuideInputPanel(true)}
                  title="Générer avec Mistral AI"
                >
                  ✦ Générer
                </button>
                <button className={styles.editBtn} onClick={startGuideEdit}>
                  {game.scoring_guide ? 'Modifier' : '+ Ajouter'}
                </button>
              </div>
            )}
          </div>

          {guideInputPanel && !guideEdit && (
            <div className={styles.generatePanel}>
              <p className={styles.generateHint}>
                Collez les règles de score du livret pour un résultat précis.
                Sans texte, le guide sera approximatif pour les jeux complexes.
              </p>
              <textarea
                className={styles.guideTextarea}
                value={rulesInput}
                onChange={e => setRulesInput(e.target.value)}
                placeholder={'Copiez ici la section "Fin de partie" ou "Décompte des points" du livret de règles…'}
                rows={7}
                autoFocus
              />
              <div className={styles.guideActions}>
                <button
                  className="btn btn-primary"
                  onClick={generateGuide}
                  disabled={guideGenerating}
                >
                  {guideGenerating ? '⏳ Génération…' : '✦ Générer'}
                </button>
                <button className="btn btn-ghost" onClick={cancelGeneratePanel}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {guideEdit ? (
            <div className={styles.guideEditor}>
              <textarea
                className={styles.guideTextarea}
                value={guideDraft}
                onChange={e => setGuideDraft(e.target.value)}
                placeholder="Décrivez comment compter les points pour ce jeu…"
                rows={5}
                autoFocus
              />
              <div className={styles.guideActions}>
                <button className="btn btn-primary" onClick={saveGuide} disabled={guideSaving}>
                  {guideSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button className="btn btn-ghost" onClick={() => setGuideEdit(false)}>Annuler</button>
              </div>
            </div>
          ) : game.scoring_guide ? (
            <div
              className={styles.guideMarkdown}
              dangerouslySetInnerHTML={{ __html: marked.parse(game.scoring_guide) }}
            />
          ) : (
            <p className={styles.emptyLoans}>Aucun guide de score renseigné.</p>
          )}

          {/* Strategy guide */}
          <div className={styles.sectionHeader}>
            <div className={styles.label}>Stratégie</div>
            {!strategyEdit && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={styles.editBtn}
                  onClick={generateStrategy}
                  disabled={strategyGenerating}
                  title="Générer avec Mistral AI"
                >
                  {strategyGenerating ? '⏳ Génération…' : '✦ Générer'}
                </button>
                <button className={styles.editBtn} onClick={startStrategyEdit}>
                  {game.strategy_guide ? 'Modifier' : '+ Ajouter'}
                </button>
              </div>
            )}
          </div>

          {strategyEdit ? (
            <div className={styles.guideEditor}>
              <textarea
                className={styles.guideTextarea}
                value={strategyDraft}
                onChange={e => setStrategyDraft(e.target.value)}
                placeholder="Décrivez la meilleure stratégie pour gagner à ce jeu…"
                rows={5}
                autoFocus
              />
              <div className={styles.guideActions}>
                <button className="btn btn-primary" onClick={saveStrategy} disabled={strategySaving}>
                  {strategySaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button className="btn btn-ghost" onClick={() => setStrategyEdit(false)}>Annuler</button>
              </div>
            </div>
          ) : game.strategy_guide ? (
            <div
              className={styles.guideMarkdown}
              dangerouslySetInnerHTML={{ __html: marked.parse(game.strategy_guide) }}
            />
          ) : (
            <p className={styles.emptyLoans}>Aucune stratégie renseignée.</p>
          )}

          {/* Score sheet template */}
          <div className={styles.sectionHeader}>
            <div className={styles.label}>Feuille de score</div>
            <button
              className={styles.editBtn}
              onClick={() => {
                if (sheetBuilderOpen) { setSheetBuilderOpen(false); return }
                setSheetDraft(game.score_sheet_template || '{"sections":[]}')
                setSheetBuilderOpen(true)
              }}
            >
              {sheetBuilderOpen ? 'Annuler' : game.score_sheet_template ? 'Modifier' : '+ Créer'}
            </button>
          </div>

          {sheetBuilderOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ScoreSheetBuilder value={sheetDraft} onChange={setSheetDraft} />
              <div className={styles.guideActions}>
                <button className="btn btn-primary" onClick={saveSheet} disabled={sheetSaving}>
                  {sheetSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button className="btn btn-ghost" onClick={() => setSheetBuilderOpen(false)}>Annuler</button>
              </div>
            </div>
          ) : template ? (
            <p className={styles.sheetSummary}>
              {template.sections.map(s => s.label || 'Section').join(' · ')}
              {' — '}{template.sections.reduce((n, s) => n + s.fields.length, 0)} champ(s)
            </p>
          ) : (
            <p className={styles.emptyLoans}>Aucune feuille de score configurée.</p>
          )}

          {/* Play log */}
          <div className={styles.sectionHeader} ref={playLogRef}>
            <div className={styles.label}>Parties jouées</div>
            <button className={styles.editBtn} onClick={() => showAddPlay ? resetPlayForm() : setShowAddPlay(true)}>
              {showAddPlay ? 'Annuler' : '+ Ajouter'}
            </button>
          </div>

          {showAddPlay && (
            <div className={styles.addPlay}>
              {editingPlayId && <div className={styles.playLabel}>Modification de la partie</div>}
              <div className={styles.playRow}>
                <label className={styles.playLabel}>Date</label>
                <input type="date" value={playDate} onChange={e => setPlayDate(e.target.value)} />
              </div>
              <div className={styles.playRow}>
                <label className={styles.playLabel}>Durée (min)</label>
                <input type="number" min="1" value={playDuration} onChange={e => setPlayDuration(e.target.value)} placeholder="Optionnel" />
              </div>
              <div className={styles.playRow}>
                <label className={styles.playLabel}>Notes</label>
                <input type="text" value={playNotes} onChange={e => setPlayNotes(e.target.value)} placeholder="Optionnel" />
              </div>
              {extensions.length > 0 && (
                <div className={styles.playRow} style={{ alignItems: 'flex-start' }}>
                  <label className={styles.playLabel}>Extensions</label>
                  <div className={styles.playExpansions}>
                    {extensions.map(e => (
                      <label key={e.id} className={styles.playExpansionCheck}>
                        <input
                          type="checkbox"
                          checked={playExpansionIds.includes(e.id)}
                          onChange={() => togglePlayExpansion(e.id)}
                        />
                        {e.title}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {checkedExpansionsMissingSheet.length > 0 && (
                <p className={styles.generateHint}>
                  💡 {checkedExpansionsMissingSheet.map(e => e.title).join(', ')}
                  {checkedExpansionsMissingSheet.length > 1 ? " n'ont" : " n'a"} pas de feuille de score dédiée —
                  ajoutez-en une depuis {checkedExpansionsMissingSheet.length > 1 ? 'leur' : 'sa'} fiche pour l'afficher ici.
                </p>
              )}
              {playTemplate ? (
                <div className={styles.sheetWrap}>
                  <div className={styles.sheetTable}>
                    {/* Player header row */}
                    <div className={styles.sheetHeaderRow}>
                      <div className={styles.sheetFieldCol} />
                      {playPlayers.map((p, i) => (
                        <div key={i} className={styles.sheetPlayerCol}>
                          <input
                            className={styles.sheetPlayerName}
                            placeholder={`Joueur ${i + 1}`}
                            value={p.player_name}
                            onChange={e => updatePlayer(i, 'player_name', e.target.value)}
                          />
                          <div className={styles.sheetPlayerMeta}>
                            <label className={styles.sheetWinnerLabel}>
                              <input type="checkbox" checked={p.winner} onChange={e => updatePlayer(i, 'winner', e.target.checked)} />
                              🏆
                            </label>
                            {playPlayers.length > 1 && (
                              <button className={styles.removePlayer} onClick={() => setPlayPlayers(prev => prev.filter((_, j) => j !== i))}>✕</button>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className={styles.sheetAddCol}>
                        <button className={styles.addPlayerBtn} onClick={() => setPlayPlayers(prev => [...prev, { ...EMPTY_PLAYER }])}>+</button>
                      </div>
                    </div>

                    {/* Section and field rows */}
                    {playTemplate.sections.map(sec => (
                      <div key={sec.id}>
                        {sec.label && (
                          <div className={styles.sheetSectionRow}>
                            <span>{sec.label}</span>
                          </div>
                        )}
                        {sec.fields.map(field => (
                          <div key={field.id} className={styles.sheetRow}>
                            <div className={styles.sheetFieldCol}>
                              <span className={styles.sheetFieldName}>{field.label || '—'}</span>
                              {field.type === 'number' && (field.multiplier || 1) !== 1 && (
                                <span className={styles.sheetFieldMeta}>×{field.multiplier}</span>
                              )}
                              {field.type === 'checkbox' && (
                                <span className={styles.sheetFieldMeta}>{field.points || 0} pts</span>
                              )}
                              {field.description && (
                                <span className={styles.sheetFieldDesc}>{field.description}</span>
                              )}
                            </div>
                            {playPlayers.map((p, i) => (
                              <div key={i} className={styles.sheetPlayerCol}>
                                {field.type === 'number' ? (
                                  <input
                                    type="number"
                                    className={styles.sheetNumInput}
                                    value={p.score_data?.[field.id] ?? ''}
                                    onChange={e => updatePlayerField(i, field.id, e.target.value)}
                                    placeholder="0"
                                  />
                                ) : (
                                  <input
                                    type="checkbox"
                                    className={styles.sheetCheckInput}
                                    checked={!!p.score_data?.[field.id]}
                                    onChange={e => updatePlayerField(i, field.id, e.target.checked)}
                                  />
                                )}
                              </div>
                            ))}
                            <div className={styles.sheetAddCol} />
                          </div>
                        ))}
                      </div>
                    ))}

                    {/* Total row */}
                    <div className={`${styles.sheetRow} ${styles.sheetTotalRow}`}>
                      <div className={styles.sheetFieldCol}>
                        <span className={styles.sheetFieldName}>Total</span>
                      </div>
                      {playPlayers.map((p, i) => (
                        <div key={i} className={`${styles.sheetPlayerCol} ${styles.sheetTotalCell}`}>
                          {computeTotal(p, playTemplate.sections)}
                        </div>
                      ))}
                      <div className={styles.sheetAddCol} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.playLabel} style={{ marginTop: 8 }}>Joueurs</div>
                  {playPlayers.map((p, i) => (
                    <div key={i} className={styles.playerRow}>
                      <input
                        className={styles.playerName}
                        placeholder="Nom"
                        value={p.player_name}
                        onChange={e => updatePlayer(i, 'player_name', e.target.value)}
                      />
                      <input
                        className={styles.playerScore}
                        type="number"
                        placeholder="Score"
                        value={p.score}
                        onChange={e => updatePlayer(i, 'score', e.target.value)}
                      />
                      <label className={styles.winnerCheck}>
                        <input type="checkbox" checked={p.winner} onChange={e => updatePlayer(i, 'winner', e.target.checked)} />
                        Gagnant
                      </label>
                      {playPlayers.length > 1 && (
                        <button className={styles.removePlayer} onClick={() => setPlayPlayers(prev => prev.filter((_, j) => j !== i))}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className={styles.addPlayerBtn} onClick={() => setPlayPlayers(prev => [...prev, { ...EMPTY_PLAYER }])}>
                    + Joueur
                  </button>
                </>
              )}
              <div className={styles.guideActions}>
                <button className="btn btn-primary" onClick={submitPlay} disabled={playSaving || !playDate}>
                  {playSaving ? 'Enregistrement…' : editingPlayId ? 'Enregistrer les modifications' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {playList.length === 0 && !showAddPlay && (
            <p className={styles.emptyLoans}>Aucune partie enregistrée.</p>
          )}
          {playList.length > 0 && (
            <ul className={styles.playLogList}>
              {playList.map(play => (
                <li key={play.id} className={styles.playLogItem}>
                  <div className={styles.playLogHeader}>
                    <span className={styles.playLogDate}>{new Date(play.played_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    {play.duration_min && <span className={styles.playLogMeta}>{play.duration_min} min</span>}
                    <button className={styles.editPlay} onClick={() => startEditPlay(play)}>✎</button>
                    <button className={styles.deletePlay} onClick={() => deletePlay(play.id)}>✕</button>
                  </div>
                  {play.players.length > 0 && (
                    <div className={styles.playPlayers}>
                      {play.players.map(p => (
                        <span key={p.id} className={`${styles.playPlayer} ${p.winner ? styles.winner : ''}`}>
                          {p.winner ? '🏆 ' : ''}{p.player_name}{p.score != null ? ` — ${p.score}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {play.expansions?.length > 0 && (
                    <div className={styles.playExpansionTags}>
                      {play.expansions.map(e => (
                        <span key={e.id} className={styles.playExpansionTag}>{e.title}</span>
                      ))}
                    </div>
                  )}
                  {play.notes && <p className={styles.playNotes}>{play.notes}</p>}
                </li>
              ))}
            </ul>
          )}

          {game.description && (
            <>
              <div className={styles.label}>Description</div>
              <p className={styles.desc}>{game.description.slice(0, 600)}{game.description.length > 600 ? '…' : ''}</p>
            </>
          )}

          {extensions.length > 0 && (
            <>
              <div className={styles.label}>Extensions possédées</div>
              <div className={styles.extList}>
                {extensions.map(e => (
                  <button key={e.id} className={styles.extCard} onClick={() => navigate(`/library/${e.id}`)}>
                    <div className={styles.extThumb}>
                      {e.thumbnail_url
                        ? <img src={e.thumbnail_url} alt={e.title} loading="lazy" />
                        : <span>{e.title.slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div>
                      <div className={styles.extName}>{e.title}</div>
                      {e.year_published && <div className={styles.extYear}>{e.year_published}</div>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {similarGames.length > 0 && (
            <>
              <div className={styles.label}>Vous aimerez peut-être</div>
              <div className={styles.simList}>
                {similarGames.map(g => (
                  <button key={g.id} className={styles.simCard} onClick={() => navigate(`/library/${g.id}`)}>
                    <div className={styles.simThumb}>
                      {g.thumbnail_url
                        ? <img src={g.thumbnail_url} alt={g.title} loading="lazy" />
                        : <span>{g.title.slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div className={styles.simInfo}>
                      <div className={styles.simName}>{g.title}</div>
                      <div className={styles.simMeta}>
                        {g.min_players && g.max_players ? `${g.min_players}–${g.max_players} joueurs` : ''}
                        {g.playing_time ? ` · ${g.playing_time} min` : ''}
                        {g.bgg_rating ? ` · ★ ${g.bgg_rating.toFixed(1)}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className={styles.label}>Historique des prêts</div>
          {loanHistory.length === 0
            ? <p className={styles.emptyLoans}>Jamais prêté — bon bilan !</p>
            : (
              <ul className={styles.loanList}>
                {loanHistory.map(l => (
                  <li key={l.id} className={styles.loanItem}>
                    <span>{l.friend_name}</span>
                    <span className={styles.loanDates}>
                      {new Date(l.lent_at).toLocaleDateString('fr-FR')}
                      {l.returned_at ? ` → ${new Date(l.returned_at).toLocaleDateString('fr-FR')}` : ' (en cours)'}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </div>
      </div>
    </div>
  )
}
