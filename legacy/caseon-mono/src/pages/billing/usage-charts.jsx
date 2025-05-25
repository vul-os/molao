import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useUsageData } from './hooks';
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, AlertCircle } from "lucide-react";
import UsageDonut from './usage-donut';

export default function UsageCharts() {
  const { activeFirm } = useAuth();
  const { usageLoading, usageStats, usageError, fetchUsageData } = useUsageData(activeFirm);

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
        <div className="mx-auto w-16 h-16 bg-red-50 border border-red-200 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-red-400" />
        </div>
        <p className="text-slate-600">Unable to load usage data</p>
        <button 
          onClick={fetchUsageData}
          className="mt-2 text-sm text-amber-600 hover:text-amber-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {/* Donut Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-slate-700 mb-4 text-center">Daily Usage</h3>
            <div className="flex justify-center">
              <UsageDonut 
                type="daily"
                usageStats={usageStats}
                usageLoading={usageLoading}
                usageError={usageError}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-slate-700 mb-4 text-center">Monthly Usage</h3>
            <div className="flex justify-center">
              <UsageDonut 
                type="monthly"
                usageStats={usageStats}
                usageLoading={usageLoading}
                usageError={usageError}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Summary */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="text-lg font-serif font-medium text-slate-800 mb-2">
              {usageStats.plan_name} Plan
            </h3>
            <p className="text-slate-600">
              {usageStats.can_query 
                ? "You can continue making queries within your plan limits."
                : "You have reached your usage limits. Please upgrade your plan to continue."}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 max-w-md mx-auto">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">Daily Remaining</p>
                <p className="text-2xl font-bold text-slate-800">{usageStats.daily_remaining}</p>
                <p className="text-xs text-slate-500">queries</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">Monthly Remaining</p>
                <p className="text-2xl font-bold text-slate-800">{usageStats.monthly_remaining}</p>
                <p className="text-xs text-slate-500">queries</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 