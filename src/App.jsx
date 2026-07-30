import { BrowserRouter as Router, Routes, Route, NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Tv, Film, Search } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { DataProvider } from './context/DataContext';
import UndoToast from './components/UndoToast';
import Dashboard from './pages/Dashboard';
import Shows from './pages/Shows';
import Movies from './pages/Movies';
import SearchPage from './pages/Search';
import Details from './pages/Details';

function App() {
  return (
    <DataProvider>
      <Router>
        <div className="app-container">
          <header className="header">
            <Link to="/" className="logo" style={{ textDecoration: 'none', color: 'inherit' }}>
              <img src="/logo.jpg" alt="Logo" className="logo-icon" />
              <h1>ShowBase</h1>
            </Link>
            <nav className="nav">
              <NavLink to="/" className={({isActive}) => `nav-btn ${isActive ? 'active' : ''}`}>
                <LayoutDashboard size={18} className="nav-icon" /> <span className="nav-label">Dashboard</span>
              </NavLink>
              <NavLink to="/shows" className={({isActive}) => `nav-btn ${isActive ? 'active' : ''}`}>
                <Tv size={18} className="nav-icon" /> <span className="nav-label">Shows</span>
              </NavLink>
              <NavLink to="/movies" className={({isActive}) => `nav-btn ${isActive ? 'active' : ''}`}>
                <Film size={18} className="nav-icon" /> <span className="nav-label">Movies</span>
              </NavLink>
              <NavLink to="/search" className={({isActive}) => `nav-btn ${isActive ? 'active' : ''}`}>
                <Search size={18} className="nav-icon" /> <span className="nav-label">Search</span>
              </NavLink>
            </nav>
          </header>

          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/shows" element={<Shows />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/details/:type/:id" element={<Details />} />
            </Routes>
          </main>
          <UndoToast />
        </div>
      </Router>
    </DataProvider>
  );
}

export default App;
