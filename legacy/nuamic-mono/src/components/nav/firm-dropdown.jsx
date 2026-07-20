import React, { useState } from 'react';
import { Building2, ChevronDown, Plus } from 'lucide-react';
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

const FirmDropdown = ({ 
  firms, 
  activeFirm, 
  switchFirm,
  onCreateClick
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleCreateClick = (event) => {
    event.preventDefault();
    setIsOpen(false);
    onCreateClick();
  };

  const getFirmInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center gap-2 h-9 px-3 bg-white border-gray-200 hover:bg-gray-50"
        >
          {activeFirm ? (
            <Avatar className="h-6 w-6">
              <AvatarImage src={activeFirm.avatar} alt={activeFirm.name} />
              <AvatarFallback className="bg-gray-100 text-gray-900">
                {getFirmInitials(activeFirm.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Building2 className="h-5 w-5 text-gray-500" />
          )}
          <span className="max-w-[120px] truncate font-medium text-gray-900">
            {activeFirm?.name || 'Select Firm'}
          </span>
          <ChevronDown 
            className="h-4 w-4 transition-transform duration-200 text-gray-500" 
            style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} 
          />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuPortal>
        <DropdownMenuContent 
          className="w-[280px]" 
          align="start"
          sideOffset={5}
        >
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-10 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              onClick={handleCreateClick}
            >
              <Plus className="h-4 w-4 mr-2" />
              Register New Firm
            </Button>
          </div>

          <DropdownMenuSeparator />
          
          <DropdownMenuGroup className="p-1 max-h-[400px] overflow-y-auto">
            {firms.map((firm) => (
              <DropdownMenuItem
                key={firm.id}
                onSelect={() => {
                  switchFirm(firm.id);
                  setIsOpen(false);
                }}
                className="p-2 cursor-pointer focus:bg-gray-50"
              >
                <div className={`flex items-center gap-3 w-full ${
                  activeFirm?.id === firm.id ? 'text-gray-900' : 'text-gray-700'
                }`}>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={firm.avatar} alt={firm.name} />
                    <AvatarFallback className="bg-gray-100 text-gray-900">
                      {getFirmInitials(firm.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">
                      {firm.name}
                    </span>
                    <span className="text-sm text-gray-500">
                      {firm.role || 'Member'}
                    </span>
                  </div>
                  {firm.status !== 'active' && (
                    <span className="ml-auto text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full capitalize">
                      {firm.status}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}

            {firms.length === 0 && (
              <div className="py-4 px-2 text-center">
                <p className="text-sm text-gray-500">No firms found</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-gray-900 hover:bg-gray-50"
                  onClick={handleCreateClick}
                >
                  Register a firm
                </Button>
              </div>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};

export default FirmDropdown;