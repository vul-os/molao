import { Link } from 'react-router-dom';
import Logo from '@/assets/icon.svg';

const renderCompanyName = () => (
    <Link to="/" className="flex items-center group">
      <div className="logo-container flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm overflow-hidden transition-all duration-300 group-hover:shadow-blue-200 group-hover:shadow-md">
        <img src={Logo} alt="StorNxtDoor" className="w-6 h-6" />
      </div>
      <div className="ml-2 flex flex-col">
        <span className="company-name text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-blue-500 to-blue-600">
          StorNxtDoor
        </span>
        <span className="text-[10px] text-slate-500 -mt-1 tracking-wider uppercase font-medium">Storage Marketplace</span>
      </div>
    </Link>
  );

export default renderCompanyName;