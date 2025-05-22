import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useUsageData, formatPercentage } from './hooks';
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";

export default function UsageCharts() {
  const { user } = useAuth();
  const { usageLoading, usageStats, usageError, fetchUsageData } = useUsageData(user);

  if (usageLoading) {
    return (
      <div className="w-full flex justify-center items-center py-10">
        <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
      </div>
    );
  }

  if (usageError || !usageStats) {
    return (
      <div className="w-full text-center py-6">
        <p className="text-slate-500">Unable to load usage data</p>
        <button 
          onClick={fetchUsageData}
          className="mt-2 text-sm text-amber-600 hover:text-amber-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Default usage data if not available
  const dailyUsage = usageStats.daily_usage || 0;
  const dailyLimit = usageStats.daily_limit || 100;
  const dailyPercentage = Math.min(100, Math.round((dailyUsage / dailyLimit) * 100));

  const monthlyUsage = usageStats.monthly_usage || 0; 
  const monthlyLimit = usageStats.monthly_limit || 1000;
  const monthlyPercentage = Math.min(100, Math.round((monthlyUsage / monthlyLimit) * 100));

  return (
    <div className="w-full grid gap-6 md:grid-cols-2">
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="mb-2 flex justify-between">
            <h3 className="text-sm font-medium text-slate-700">Daily Usage</h3>
            <span className="text-sm text-slate-500">{dailyUsage} / {dailyLimit}</span>
          </div>
          <Progress 
            value={dailyPercentage} 
            className="h-2 bg-slate-100"
            indicatorClassName={dailyPercentage > 90 ? "bg-red-500" : "bg-amber-500"}
          />
          <p className="mt-2 text-xs text-slate-500 text-right">
            {dailyPercentage}% Used
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="mb-2 flex justify-between">
            <h3 className="text-sm font-medium text-slate-700">Monthly Usage</h3>
            <span className="text-sm text-slate-500">{monthlyUsage} / {monthlyLimit}</span>
          </div>
          <Progress 
            value={monthlyPercentage} 
            className="h-2 bg-slate-100"
            indicatorClassName={monthlyPercentage > 90 ? "bg-red-500" : "bg-amber-500"}
          />
          <p className="mt-2 text-xs text-slate-500 text-right">
            {monthlyPercentage}% Used
          </p>
        </CardContent>
      </Card>
    </div>
  );
} 