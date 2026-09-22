import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import Protected from './components/Protected';
import Layout from './components/Layout';
import Login from './pages/Login';
import Characters from './pages/Characters';
import CharacterEditor from './pages/CharacterEditor';
import Costumes from './pages/Costumes';
import Backgrounds from './pages/Backgrounds';
import Medias from './pages/Medias';
import Economy from './pages/Economy';
import RemoteConfig from './pages/RemoteConfig';
import Dances from './pages/Dances';
import Quests from './pages/Quests';
import Privilege from './pages/Privilege';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Characters />} />
              <Route path="/characters/:id" element={<CharacterEditor />} />
              <Route path="/costumes" element={<Costumes />} />
              <Route path="/backgrounds" element={<Backgrounds />} />
              <Route path="/medias" element={<Medias />} />
              <Route path="/economy" element={<Economy />} />
              <Route path="/remote-config" element={<RemoteConfig />} />
              <Route path="/dances" element={<Dances />} />
              <Route path="/quests" element={<Quests />} />
              <Route path="/privilege" element={<Privilege />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
