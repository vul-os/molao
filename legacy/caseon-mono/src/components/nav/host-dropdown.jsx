import React, { useState } from 'react';
import { Building2, ChevronDown, Plus, MapPin } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";

const HostDropdown = ({ 
  hosts, 
  activeHost, 
  switchHost,
  onCreateClick
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleCreateClick = (event) => {
    event.preventDefault();
    setIsOpen(false);
    onCreateClick();
  };

  const getHostInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getLocationString = (host) => {
    const parts = [host.city, host.state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center gap-2 h-9 px-3 bg-white hover:bg-gray-50"
        >
          {activeHost ? (
            <Avatar className="h-6 w-6">
              <AvatarImage src={activeHost.avatar} alt={activeHost.name} />
              <AvatarFallback>{getHostInitials(activeHost.name)}</AvatarFallback>
            </Avatar>
          ) : (
            <Building2 className="h-5 w-5" />
          )}
          <span className="max-w-[120px] truncate font-medium">
            {activeHost?.name || 'Select Host'}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 opacity-70" 
            style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} 
          />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuPortal>
        <DropdownMenuContent 
          className="w-80" 
          align="start"
          sideOffset={5}
        >
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-10 hover:bg-gray-50"
              onClick={handleCreateClick}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Host
            </Button>
          </div>

          <DropdownMenuSeparator />
          
          <DropdownMenuGroup className="p-1 max-h-[400px] overflow-y-auto">
            {hosts.map((host) => (
              <DropdownMenuItem
                key={host.id}
                onSelect={() => {
                  switchHost(host.id);
                  setIsOpen(false);
                }}
                className="p-2 cursor-pointer focus:bg-gray-50"
              >
                <div className={`flex items-center gap-3 w-full ${
                  activeHost?.id === host.id ? 'text-primary' : ''
                }`}>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={host.avatar} alt={host.name} />
                    <AvatarFallback>{getHostInitials(host.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">
                      {host.name}
                    </span>
                    {getLocationString(host) && (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {getLocationString(host)}
                      </span>
                    )}
                  </div>
                  {host.status !== 'active' && (
                    <span className="ml-auto text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded capitalize">
                      {host.status}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};

export default HostDropdown;