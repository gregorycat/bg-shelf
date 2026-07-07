import { useState, useEffect } from 'react'
import styles from './ScoreSheetBuilder.module.css'

const uid = () => Math.random().toString(36).slice(2, 10)
const emptySection = () => ({ id: uid(), label: '', fields: [] })
const emptyField  = () => ({ id: uid(), label: '', type: 'number', multiplier: 1, description: '' })

export default function ScoreSheetBuilder({ value, onChange }) {
  const [sections, setSections] = useState(() => {
    try { return JSON.parse(value || '{}').sections || [] } catch { return [] }
  })

  useEffect(() => { onChange(JSON.stringify({ sections })) }, [sections])

  const addSection = () => setSections(s => [...s, emptySection()])

  const removeSection = (sid) => setSections(s => s.filter(sec => sec.id !== sid))

  const updateSection = (sid, patch) =>
    setSections(s => s.map(sec => sec.id === sid ? { ...sec, ...patch } : sec))

  const addField = (sid) =>
    setSections(s => s.map(sec =>
      sec.id === sid ? { ...sec, fields: [...sec.fields, emptyField()] } : sec
    ))

  const removeField = (sid, fid) =>
    setSections(s => s.map(sec =>
      sec.id === sid ? { ...sec, fields: sec.fields.filter(f => f.id !== fid) } : sec
    ))

  const updateField = (sid, fid, patch) =>
    setSections(s => s.map(sec =>
      sec.id === sid
        ? { ...sec, fields: sec.fields.map(f => f.id === fid ? { ...f, ...patch } : f) }
        : sec
    ))

  return (
    <div className={styles.builder}>
      {sections.length === 0 && (
        <p className={styles.empty}>Aucune section. Ajoutez-en une pour construire la feuille.</p>
      )}

      {sections.map((sec, si) => (
        <div key={sec.id} className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionNum}>{si + 1}</span>
            <input
              className={styles.sectionLabel}
              value={sec.label}
              onChange={e => updateSection(sec.id, { label: e.target.value })}
              placeholder="Nom de la section (ex : Animaux, Manche 1…)"
            />
            <button className={styles.removeBtn} onClick={() => removeSection(sec.id)} title="Supprimer la section">✕</button>
          </div>

          <div className={styles.fields}>
            {sec.fields.length === 0 && (
              <p className={styles.fieldEmpty}>Aucun champ — ajoutez des lignes de score.</p>
            )}
            {sec.fields.map(field => (
              <div key={field.id} className={styles.fieldBlock}>
                <div className={styles.fieldRow}>
                  <input
                    className={styles.fieldLabel}
                    value={field.label}
                    onChange={e => updateField(sec.id, field.id, { label: e.target.value })}
                    placeholder="Nom (ex : Lapins, Objectif…)"
                  />
                  <select
                    className={styles.fieldType}
                    value={field.type}
                    onChange={e => updateField(sec.id, field.id, { type: e.target.value })}
                  >
                    <option value="number">Nombre</option>
                    <option value="checkbox">Case à cocher</option>
                  </select>
                  <div className={styles.multiplier}>
                    <span className={styles.multSign}>×</span>
                    <input
                      className={styles.multInput}
                      type="number"
                      step="0.5"
                      value={field.type === 'checkbox' ? (field.points ?? 1) : (field.multiplier ?? 1)}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 1
                        updateField(sec.id, field.id,
                          field.type === 'checkbox' ? { points: v } : { multiplier: v }
                        )
                      }}
                      title={field.type === 'checkbox' ? 'Points si coché' : 'Multiplicateur'}
                    />
                  </div>
                  <button className={styles.removeBtn} onClick={() => removeField(sec.id, field.id)} title="Supprimer">✕</button>
                </div>
                <input
                  className={styles.fieldDesc}
                  value={field.description || ''}
                  onChange={e => updateField(sec.id, field.id, { description: e.target.value })}
                  placeholder="Description (optionnel) — explique comment compter ce champ"
                />
              </div>
            ))}
            <button className={styles.addFieldBtn} onClick={() => addField(sec.id)}>
              + Champ
            </button>
          </div>
        </div>
      ))}

      <button className={styles.addSectionBtn} onClick={addSection}>
        + Nouvelle section
      </button>
    </div>
  )
}
