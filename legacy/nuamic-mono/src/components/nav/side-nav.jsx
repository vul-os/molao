import React from "react";
import { Home, Settings, Building2, Users, Calendar, MessageSquare, BarChart3 } from "lucide-react";
import { NavItem } from "./nav-item";
import { cn } from "@/lib/utils";

const navItems = [
  { 
    to: "/host",
    icon: Home,
    text: "Dashboard",
    description: "Overview and quick actions"
  },
  {
    to: "/host/spaces",
    icon: Building2,
    text: "Spaces",
    description: "Manage your spaces"
  },
  {
    to: "/host/bookings",
    icon: Calendar,
    text: "Bookings",
    description: "View and manage reservations"
  },
  {
    to: "/host/messages",
    icon: MessageSquare,
    text: "Messages",
    description: "Inbox and communications"
  },
  { 
    to: "/host/settings",
    icon: Settings,
    text: "Settings",
    description: "Preferences and configuration"
  },
];

const SideNav = ({ isExpanded, isMobile }) => {
  return (
    <aside
      className={cn(
        "fixed top-16 left-0 h-[calc(100vh-4rem)] bg-white border-r border-gray-200",
        "flex flex-col transition-all duration-300 ease-in-out",
        "overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent",
        isExpanded ? "w-64" : isMobile ? "w-0" : "w-16",
        !isExpanded && !isMobile && "hover:w-64 hover:shadow-lg group"
      )}
    >
      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-4">
        <div className="space-y-1">
          {navItems.map((item, index) => (
            <NavItem 
              key={item.to} 
              {...item} 
              isExpanded={isExpanded}
              hasOrganizations={true}
              className={cn(
                "relative",
                "transition-all duration-200 ease-in-out",
                "rounded-lg",
                "hover:bg-blue-50 hover:text-blue-600",
                "group/item",
                index === 0 && "bg-blue-50 text-blue-600"
              )}
            />
          ))}
        </div>
      </nav>

      {/* Bottom Section - Optional status or user info */}
      <div className={cn(
        "p-4 border-t border-gray-100",
        "transition-opacity duration-200",
        (!isExpanded && !isMobile) ? "opacity-0 group-hover:opacity-100" : "opacity-100"
      )}>
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className={cn(
            "text-sm text-gray-600 whitespace-nowrap",
            (!isExpanded && !isMobile) && "hidden group-hover:inline"
          )}>
            System Status: Online
          </span>
        </div>
      </div>
    </aside>
  );
};

export default SideNav;