import { NavLink, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '🏠', exact: true },
  { to: '/order', label: 'Input Order', icon: '📝' },
  { to: '/purchase', label: 'Catat Penerimaan', icon: '📦' },
  { to: '/reports', label: 'Laporan', icon: '📊' },
  { to: '/analytics', label: 'Analitik', icon: '📈' },
  { to: '/master', label: 'Master Data', icon: '🗂️' },
  { to: '/settings', label: 'Pengaturan', icon: '⚙️' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('rbn_token');
    navigate('/login');
  };

  return (
    <aside className="w-60 min-h-screen bg-brand-red flex flex-col shadow-xl flex-shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-red-700">
        <div className="flex items-center gap-3">
          <img
            src="https://staff-portal.rotibakarngeunah.my.id/wp-content/uploads/2026/05/cropped-Untitled-2.png"
            alt="Logo"
            className="w-10 h-10 rounded-lg object-contain bg-white p-1"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Roti Bakar</p>
            <p className="text-red-200 font-bold text-base leading-tight">Ngeunah</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-brand-red shadow-sm'
                  : 'text-red-100 hover:bg-red-700 hover:text-white'
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-red-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-200 hover:bg-red-700 hover:text-white transition-colors"
        >
          <span className="text-lg leading-none">🚪</span>
          Keluar
        </button>
      </div>
    </aside>
  );
}
