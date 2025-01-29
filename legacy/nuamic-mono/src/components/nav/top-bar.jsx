import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Menu, Settings, LogOut } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/assets/icon.svg';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FirmDropdown from './firm-dropdown';

const TopBar = ({ 
  onMenuClick,
  showMobileMenu = true,
  onCreateFirm 
}) => {
  const { 
    user, 
    signOut, 
    firms, 
    activeFirm,
    switchFirm
  } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/signin');
      toast({
        title: "Signed out successfully",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSwitchFirm = (firmId) => {
    try {
      const newFirm = switchFirm(firmId);
      if (newFirm) {
        toast({
          title: "Firm switched",
          description: `Switched to ${newFirm.name}`,
          duration: 2000,
        });
      }
    } catch (error) {
      toast({
        title: "Error switching firm",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleFirmSignup = () => {
    navigate('/signup#firm');
  };

  const getUserInitials = () => {
    if (!user?.email) return 'U';
    return user.email
      .split('@')[0]
      .split('.')
      .map(part => part[0]?.toUpperCase())
      .join('')
      .slice(0, 2);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
      <nav className="h-16 px-4 lg:px-6">
        <div className="h-full flex items-center justify-between w-full">
          {/* Left section with menu and logo */}
          <div className="flex items-center gap-4">
            {showMobileMenu && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={onMenuClick}
                aria-label="Toggle menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            
            <RouterLink 
              to="/" 
              className="flex items-center"
              aria-label="Go to dashboard"
            >
              <img src={Logo} alt="" className="h-8 w-8" />
              <span className="hidden md:block ml-2 text-xl font-semibold text-gray-900">
                Nuamic
              </span>
            </RouterLink>
          </div>

          {/* Right section with auth buttons, firm dropdown, and user menu */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <FirmDropdown
                  firms={firms}
                  activeFirm={activeFirm}
                  switchFirm={handleSwitchFirm}
                  onCreateClick={onCreateFirm}
                />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="h-9 w-9 rounded-full p-0"
                      aria-label="Open user menu"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="bg-gray-100 text-gray-900">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-gray-900">Account</p>
                        <p className="text-xs leading-none text-gray-500 truncate">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <RouterLink 
                        to="/settings"
                        className="cursor-pointer w-full flex items-center"
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </RouterLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="cursor-pointer text-gray-700 focus:text-gray-900"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="hidden md:inline-flex text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  onClick={handleFirmSignup}
                >
                  Register Firm
                </Button>
                <RouterLink to="/signup">
                  <Button 
                    variant="ghost" 
                    className="hidden md:inline-flex text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  >
                    Sign up
                  </Button>
                </RouterLink>
                <RouterLink to="/signin">
                  <Button 
                    variant="default" 
                    className="text-sm font-medium bg-black text-white hover:bg-gray-900"
                  >
                    Sign in
                  </Button>
                </RouterLink>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default TopBar;