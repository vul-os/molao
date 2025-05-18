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
import HostDropdown from './host-dropdown';

const TopBar = ({ 
  onMenuClick,
  showMobileMenu = true,
  onCreateHost 
}) => {
  const { 
    user, 
    signOut, 
    hosts, 
    activeHost,
    switchHost
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

  const handleSwitchHost = (hostId) => {
    try {
      const newHost = switchHost(hostId);
      if (newHost) {
        toast({
          title: "Host switched",
          description: `Switched to ${newHost.name}`,
          duration: 2000,
        });
      }
    } catch (error) {
      toast({
        title: "Error switching host",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleHostSignup = () => {
    navigate('/signup#host');
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
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b">
      <nav className="h-16 px-4">
        <div className="h-full flex items-center mx-auto">
          {/* Left section - always aligned left */}
          <div className="flex items-center gap-2">
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
              <span className="hidden md:block ml-2 text-xl font-bold text-blue-600">
                StorNxtDoor
              </span>
            </RouterLink>
          </div>

          {/* Spacer to push content to edges */}
          <div className="flex-1" />

          {/* Right section - always aligned right */}
          <div className="flex items-center gap-2 md:gap-4">
            {user ? (
              <>
                <HostDropdown
                  hosts={hosts}
                  activeHost={activeHost}
                  switchHost={handleSwitchHost}
                  onCreateClick={onCreateHost}
                />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 rounded-full p-0"
                      aria-label="Open user menu"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{getUserInitials()}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">Account</p>
                        <p className="text-xs leading-none text-muted-foreground truncate">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <RouterLink 
                        to="/host/settings"
                        className="cursor-pointer w-full flex items-center"
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </RouterLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="cursor-pointer text-red-600 focus:text-red-600"
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
                  className="hidden md:inline-flex text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={handleHostSignup}
                >
                  Become a host
                </Button>
                <RouterLink to="/signup">
                  <Button variant="ghost" className="hidden md:inline-flex text-sm font-medium">
                    Sign up
                  </Button>
                </RouterLink>
                <RouterLink to="/signin">
                  <Button variant="default" size="sm" className="text-sm font-medium">
                    Log in
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