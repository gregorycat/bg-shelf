import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import GamePage from './pages/GamePage.jsx'
import BrowsePage from './pages/BrowsePage.jsx'
import PlaysPage from './pages/PlaysPage.jsx'
import LoansPage from './pages/LoansPage.jsx'
import FriendsPage from './pages/FriendsPage.jsx'
import GamePickerPage from './pages/GamePickerPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:id" element={<GamePage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/pick" element={<GamePickerPage />} />
        <Route path="/plays" element={<PlaysPage />} />
        <Route path="/loans" element={<LoansPage />} />
        <Route path="/friends" element={<FriendsPage />} />
      </Route>
    </Routes>
  )
}
