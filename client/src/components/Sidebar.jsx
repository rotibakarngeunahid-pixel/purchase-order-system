import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileBarChart,
  Image,
  Landmark,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  Settings,
  Trash2,
  Truck,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/order', label: 'Input Order', icon: ClipboardList },
  { to: '/purchase', label: 'Catat Penerimaan', icon: ClipboardCheck },
  { to: '/purchase-report', label: 'Lap. Barang Masuk', icon: PackagePlus },
  { to: '/distribution', label: 'Distribution Listing', icon: Truck },
  { to: '/distribution-photos', label: 'Foto Bukti', icon: Image },
  { to: '/reports', label: 'Laporan', icon: FileBarChart },
  { to: '/analytics', label: 'Analitik', icon: BarChart3 },
  { to: '/finance-portal', label: 'Portal Keuangan', icon: Landmark },
  { to: '/holidays', label: 'Hari Libur', icon: CalendarOff },
  { to: '/master', label: 'Master Data', icon: Database },
  { to: '/settings', label: 'Pengaturan', icon: Settings },
  { to: '/data-deletion', label: 'Hapus Data', icon: Trash2, danger: true },
];

function SidebarIcon({ icon: Icon, active = false, danger = false }) {
  return (
    <span
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-brand-red text-white shadow-sm'
          : danger
          ? 'bg-red-50 text-red-500 group-hover:bg-red-100 group-hover:text-red-700'
          : 'bg-gray-100 text-gray-500 group-hover:bg-red-50 group-hover:text-brand-red'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.3} />
    </span>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('rbn_token');
    navigate('/login');
  };

  return (
    <aside className="w-full border-b border-gray-200 bg-white shadow-sm md:w-64 md:min-h-screen md:flex-shrink-0 md:border-b-0 md:border-r md:shadow-none flex flex-col">
      {/* Logo */}
      <div className="border-b border-gray-100 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="https://staff-portal.rotibakarngeunah.my.id/wp-content/uploads/2026/05/cropped-Untitled-2.png"
              alt="Logo"
              className="h-11 w-11 rounded-xl object-contain bg-white p-1.5 ring-1 ring-gray-200 shadow-sm"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <p className="text-sm font-bold leading-tight text-gray-900">Roti Bakar</p>
              <p className="text-base font-bold leading-tight text-brand-red">Ngeunah</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-brand-red md:hidden"
            title="Keluar"
            aria-label="Keluar"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="scrollbar-none flex flex-1 gap-2 overflow-x-auto p-3 md:flex-col md:gap-1 md:overflow-visible">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `group flex h-12 flex-shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-all md:w-full ${
                isActive
                  ? 'bg-red-50 text-brand-red shadow-sm ring-1 ring-red-100'
                  : item.danger
                  ? 'text-red-500 hover:bg-red-50 hover:text-red-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <SidebarIcon icon={item.icon} active={isActive} danger={!isActive && item.danger} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="hidden border-t border-gray-100 p-3 md:block">
        <button
          onClick={handleLogout}
          className="group flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <SidebarIcon icon={LogOut} />
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
}
