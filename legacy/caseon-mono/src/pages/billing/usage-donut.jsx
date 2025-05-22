import React, { useState, useEffect } from 'react';
import { formatPercentage } from './hooks';
import { RefreshCw } from "lucide-react";

const UsageDonut = ({ type, usageStats, usageLoading, usageError }) => {
  // Calculate usage values based on type (daily or monthly)
  const getUsageValues = () => {
    if (!usageStats) return { used: 0, limit: 100, percentage: 0 };
    
    if (type === 'daily') {
      const used = usageStats.daily_usage || 0;
      const limit = usageStats.daily_limit || 100;
      const percentage = Math.min(100, Math.round((used / limit) * 100));
      return { used, limit, percentage };
    } else {
      const used = usageStats.monthly_usage || 0;
      const limit = usageStats.monthly_limit || 1000;
      const percentage = Math.min(100, Math.round((used / limit) * 100));
      return { used, limit, percentage };
    }
  };
  
  const { used, limit, percentage } = getUsageValues();
  
  // Calculate the stroke dasharray and dashoffset for the donut chart
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Determine color based on usage percentage
  const getColor = () => {
    if (percentage > 90) return '#ef4444'; // Red for high usage
    if (percentage > 70) return '#f59e0b'; // Amber for medium usage
    return '#10b981'; // Green for low usage
  };
  
  if (usageLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-40 w-40">
        <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }
  
  if (usageError) {
    return (
      <div className="flex flex-col items-center justify-center h-40 w-40 text-center">
        <p className="text-red-500 text-sm">Failed to load usage data</p>
      </div>
    );
  }
  
  return (
    <div className="relative flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="8"
        />
        
        {/* Progress circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      
      {/* Percentage text in the middle */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-800">{percentage}%</span>
        <span className="text-xs text-slate-500 mt-1">
          {type === 'daily' ? 'Daily' : 'Monthly'}
        </span>
      </div>
      
      {/* Usage text below */}
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-slate-700">
          {used} / {limit} queries
        </p>
      </div>
    </div>
  );
};

export default UsageDonut; 