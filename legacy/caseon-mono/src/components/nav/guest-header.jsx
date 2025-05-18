import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, Menu, Search, Box, Building2, X, Settings, CreditCard, MessageCircle, ChevronRight, Warehouse } from 'lucide-react';
import { Button } from "@/components/ui/button";
import Logo from '@/assets/icon.svg';
import { useAuth } from '@/context/auth-context';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { supabase } from '@/services/supabase-client';
import renderCompanyName from './company-name';

// Add CSS to the document to prevent layout shifts and add animations
const headerStyles = `
  html {
    overflow-y: scroll;
  }
  
  .nav-link {
    position: relative;
  }
  
  .nav-link::after {
    content: '';
    position: absolute;
    width: 0;
    height: 2px;
    bottom: -2px;
    left: 0;
    background-color: #3b82f6;
    transition: width 0.3s ease;
  }
  
  .nav-link:hover::after {
    width: 100%;
  }
  
  .nav-link.active::after {
    width: 100%;
  }
  
  .logo-container {
    transition: transform 0.3s ease;
  }
  
  .logo-container:hover {
    transform: scale(1.05);
  }
  
  .dropdown-animate {
    animation: dropIn 0.2s ease forwards;
  }
  
  @keyframes dropIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .header-scrolled {
    backdrop-filter: blur(8px);
    background-color: rgba(255, 255, 255, 0.9);
  }
  
  .company-name {
    background-size: 200% auto;
    animation: textShine 3s ease-in-out infinite alternate;
  }
  
  @keyframes textShine {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 100% center;
    }
  }
  
  .mobile-menu-overlay {
    animation: fadeIn 0.3s ease forwards;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { user, signOut } = useAuth();
  const [hostHasSpaces, setHostHasSpaces] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const mobileNavRef = useRef(null);

  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = headerStyles;
    document.head.appendChild(styleElement);
    
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      document.head.removeChild(styleElement);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [scrolled]);

  useEffect(() => {
    const checkForSpaces = async () => {
      if (!user) {
        setHostHasSpaces(false);
        return;
      }
      try {
        const { data, error } = await supabase.rpc('has_spaces_for_user');
        if (error) {
          console.error('Error checking for spaces:', error);
          setHostHasSpaces(false);
          return;
        }
        setHostHasSpaces(data);
      } catch (error) {
        console.error('Error in spaces check:', error);
        setHostHasSpaces(false);
      }
    };
    checkForSpaces();
  }, [user]);

  useEffect(() => {
    // Close mobile menu when route changes
    setIsOpen(false);
  }, [pathname]);

  const handleHostSignup = () => {
    navigate('/signup#host');
  };

  const getUserInitials = () => {
    if (user?.email) {
      const emailName = user.email.split('@')[0];
      return emailName[0].toUpperCase();
    }
    return "U";
  };

  const MobileNavButton = ({ to, icon: Icon, children, onClick, highlight }) => (
    <div className="w-full px-2">
      <Link 
        to={to} 
        onClick={onClick}
        className={`flex items-center w-full p-3 rounded-lg transition-all duration-300 ${
          highlight ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-slate-50'
        }`}
      >
        <Icon className={`h-5 w-5 ${highlight ? 'text-blue-600' : 'text-slate-600'} shrink-0`} />
        <span className={`ml-3 text-base ${highlight ? 'text-blue-600 font-medium' : 'text-slate-700'}`}>{children}</span>
        <ChevronRight className="h-4 w-4 ml-auto opacity-70" />
      </Link>
    </div>
  );

  const DesktopNavButton = ({ to, icon: Icon, children, highlight, isActive }) => (
    <Link 
      to={to}
      className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
        isActive 
          ? 'bg-blue-50 text-blue-600 shadow-sm' 
          : highlight 
            ? 'text-blue-600 hover:bg-blue-50' 
            : 'text-slate-700 hover:bg-slate-50 hover:text-blue-600'
      }`}
    >
      <Icon className={`h-4 w-4 mr-2 ${isActive || highlight ? 'text-blue-600' : 'text-slate-600'}`} />
      {children}
    </Link>
  );

  const NavLinks = ({ isMobile, onItemClick }) => (
    <>
      {isMobile ? (
        <div className="space-y-1">
          <MobileNavButton to="/search" icon={Search} onClick={onItemClick} highlight={pathname === '/search'}>
            Find storage
          </MobileNavButton>
          <MobileNavButton to="/host" icon={Warehouse} onClick={onItemClick} highlight={pathname === '/host'}>
            {hostHasSpaces ? "Host dashboard" : "Become a Host"}
          </MobileNavButton>
        </div>
      ) : (
        <div className="flex items-center space-x-3">
          <DesktopNavButton to="/search" icon={Search} isActive={pathname === '/search'}>
            Find storage
          </DesktopNavButton>
          <DesktopNavButton to="/host" icon={Warehouse} isActive={pathname === '/host'}>
            {hostHasSpaces ? "Host dashboard" : "Become a Host"}
          </DesktopNavButton>
        </div>
      )}
    </>
  );

  const AuthButtons = ({ isMobile, onItemClick }) => {
    if (user) {
      return (
        <div className={`${isMobile ? 'space-y-2 px-2' : 'flex items-center space-x-2'}`}>
          {isMobile ? (
            <div className="space-y-3 mt-4">
              <div className="px-4 py-4 bg-gradient-to-br from-blue-50 to-slate-50 rounded-lg mx-2 mb-2 border border-slate-200/80">
                <p className="text-sm font-semibold text-slate-900">
                  {user.email ? user.email.split('@')[0] : "User"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {user.email}
                </p>
              </div>
              
              <MobileNavButton to="/guest/home" icon={Box} onClick={onItemClick} highlight={pathname.startsWith('/guest/home')}>
                My Bookings
              </MobileNavButton>
              <MobileNavButton to="/guest/chat" icon={MessageCircle} onClick={onItemClick} highlight={pathname.startsWith('/guest/chat')}>
                Messages
              </MobileNavButton>
              <MobileNavButton to="/guest/billing" icon={CreditCard} onClick={onItemClick} highlight={pathname.startsWith('/guest/billing')}>
                Billing
              </MobileNavButton>
              
              <div className="w-full px-2 mt-6 pt-4 border-t border-slate-200">
                <button 
                  onClick={() => {
                    if (typeof signOut === 'function') {
                      signOut();
                      onItemClick?.();
                    }
                  }}
                  className="flex items-center w-full p-3 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                >
                  <X className="h-5 w-5 shrink-0" />
                  <span className="ml-3 text-base font-medium">Log out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="relative h-10 rounded-full p-0 pl-2 pr-4 border border-slate-200 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all duration-200">
                    <Avatar className="h-7 w-7 mr-2 ring-2 ring-offset-1 ring-blue-100 ring-offset-white">
                      <AvatarImage src={user.avatar_url} alt={user.email ? user.email.split('@')[0] : "User"} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">{getUserInitials()}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{user.email ? user.email.split('@')[0] : "User"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="w-56 z-50 dropdown-animate border border-slate-200 shadow-lg rounded-xl p-1"
                  alignOffset={-5}
                  sideOffset={10}
                >
                  <div className="flex flex-col space-y-1 p-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900">
                      {user.email ? user.email.split('@')[0] : "User"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {user.email}
                    </p>
                  </div>
                  
                  <DropdownMenuItem 
                    onClick={() => navigate('/host')}
                    className="bg-gradient-to-r from-blue-50 to-blue-100 hover:bg-blue-100 p-2 my-1 rounded-md"
                  >
                    <Warehouse className="mr-2 h-4 w-4 text-blue-600" />
                    <span className="text-blue-600 font-medium">{hostHasSpaces ? "Host dashboard" : "Become a Host"}</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuLabel className="text-xs text-slate-500 font-normal pl-3 pt-2">
                    Manage
                  </DropdownMenuLabel>
                  
                  <DropdownMenuItem onClick={() => navigate('/guest/home')} className="p-2 rounded-md hover:bg-slate-50">
                    <Box className="mr-2 h-4 w-4 text-slate-600" />
                    <span>My Bookings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/guest/chat')} className="p-2 rounded-md hover:bg-slate-50">
                    <MessageCircle className="mr-2 h-4 w-4 text-slate-600" />
                    <span>Messages</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/guest/billing')} className="p-2 rounded-md hover:bg-slate-50">
                    <CreditCard className="mr-2 h-4 w-4 text-slate-600" />
                    <span>Billing</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      if (typeof signOut === 'function') signOut();
                    }}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-md"
                  >
                    <X className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      );
    }
   
    return (
      <div className={`${isMobile ? 'space-y-3 px-2 pt-4' : 'flex items-center space-x-3'}`}>
        <Link 
          to="/signup" 
          className={isMobile ? 'block w-full' : ''} 
          onClick={onItemClick}
        >
          <Button 
            variant="outline"
            className={`
              ${isMobile ? 'w-full justify-center py-6 h-auto' : 'h-10'}
              text-slate-700 border-slate-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200
            `}
          >
            Sign up
          </Button>
        </Link>
        <Link 
          to="/signin" 
          className={isMobile ? 'block w-full mt-2' : ''} 
          onClick={onItemClick}
        >
          <Button 
            variant="default"
            className={`
              ${isMobile ? 'w-full justify-center py-6 h-auto' : 'h-10'}
              bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-sm transition-all duration-200
            `}
          >
            Log in
          </Button>
        </Link>
      </div>
    );
  };

  const renderMobileMenu = () => {
    if (isOpen) {
      return (
        <div 
          ref={mobileNavRef} 
          className="md:hidden fixed inset-0 z-50 mobile-menu-overlay"
        >
          <div className="fixed inset-0 bg-black/10 backdrop-blur-sm" onClick={() => setIsOpen(false)}></div>
          <div className="fixed right-0 top-0 h-full w-[85%] max-w-sm bg-white shadow-xl flex flex-col p-6 animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-8">
              {renderCompanyName()}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsOpen(false)}
                className="rounded-full hover:bg-red-50 hover:text-red-500"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
            <div className="space-y-6 mt-6">
              <NavLinks isMobile={true} onItemClick={() => setIsOpen(false)} />
            </div>
            <div className="mt-auto pt-8 border-t border-slate-100">
              <AuthButtons 
                isMobile={true} 
                onItemClick={() => setIsOpen(false)} 
              />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <header className={`sticky top-0 w-full z-30 transition-all duration-300 ${scrolled ? 'header-scrolled shadow-sm' : 'bg-white'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-16 md:h-20">
            {renderCompanyName()}
            
            <div className="hidden md:flex items-center space-x-8">
              <NavLinks isMobile={false} />
            </div>
            
            <div className="flex items-center space-x-3">
              <AuthButtons isMobile={false} />
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden rounded-full hover:bg-slate-100"
                onClick={() => setIsOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>
      </header>
      {renderMobileMenu()}
    </>
  );
};