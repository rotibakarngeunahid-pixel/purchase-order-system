import { NavLink, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'DB', exact: true },
  { to: '/order', label: 'Input Order', icon: 'IO' },
  { to: '/purchase', label: 'Catat Penerimaan', icon: 'CP' },
  { to: '/purchase-report', label: 'Lap. Barang Masuk', icon: 'BM' },
  { to: '/distribution', label: 'Distribution Listing', icon: 'DL' },
  { to: '/reports', label: 'Laporan', icon: 'LP' },
  { to: '/analytics', label: 'Analitik', icon: 'AN' },
  { to: '/master', label: 'Master Data', icon: 'MD' },
  { to: '/settings', label: 'Pengaturan', icon: 'PG' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('rbn_token');
    navigate('/login');
  };

  return (
    <aside className="w-full md:w-60 md:min-h-screen bg-brand-red flex flex-col shadow-xl md:flex-shrink-0">
      {/* Logo */}
      <div className="p-4 md:p-5 border-b border-red-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
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
          <button
            onClick={handleLogout}
            className="md:hidden px-3 py-2 rounded-lg text-xs font-semibold text-red-100 hover:bg-red-700 hover:text-white transition-colors"
          >
            Keluar
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex gap-2 overflow-x-auto md:block md:space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex flex-shrink-0 items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors md:w-full ${
                isActive
                  ? 'bg-white text-brand-red shadow-sm'
                  : 'text-red-100 hover:bg-red-700 hover:text-white'
              }`
            }
          >
            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-white text-[10px] font-bold text-brand-red leading-none">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="hidden md:block p-3 border-t border-red-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-200 hover:bg-red-700 hover:text-white transition-colors"
        >
          <span className="w-7 h-7 flex items-center justify-center rounded-md bg-white text-[10px] font-bold text-brand-red leading-none">
            EX
          </span>
          Keluar
        </button>
      </div>
    </aside>
  );
}
