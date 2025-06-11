import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";

export default function UsageLimitDialog({ 
  open, 
  onOpenChange, 
  limitErrorMessage, 
  usageDetails 
}) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate('/billing');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="flex items-center justify-center w-10 h-10 bg-amber-100 rounded-full">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <span className="font-heading">Usage Limit Reached</span>
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-sm leading-relaxed">
            You've reached your plan's search limit. Upgrade to continue accessing legal documents and cases.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {/* Plan Information */}
          {usageDetails && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Current Plan</span>
                <Badge variant="outline" className="bg-white border-slate-300 text-slate-700">
                  {usageDetails.plan_name || 'Current Plan'}
                </Badge>
              </div>
              
              {/* Usage Stats */}
              <div className="space-y-3">
                {/* Daily Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Daily Usage</span>
                    <span className="font-medium text-slate-700">
                      {usageDetails.daily_usage || 0} / {usageDetails.daily_limit || 0}
                    </span>
                  </div>
                  <Progress 
                    value={(usageDetails.daily_usage / usageDetails.daily_limit) * 100} 
                    className="h-2"
                    style={{
                      background: 'rgb(226 232 240)',
                    }}
                  />
                </div>
                
                {/* Monthly Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Monthly Usage</span>
                    <span className="font-medium text-slate-700">
                      {usageDetails.monthly_usage || 0} / {usageDetails.monthly_limit || 0}
                    </span>
                  </div>
                  <Progress 
                    value={(usageDetails.monthly_usage / usageDetails.monthly_limit) * 100} 
                    className="h-2"
                    style={{
                      background: 'rgb(226 232 240)',
                    }}
                  />
                  {usageDetails.monthly_remaining === 0 && (
                    <p className="text-xs text-amber-600 font-medium">
                      Monthly limit reached
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Error Message */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              {limitErrorMessage}
            </p>
          </div>
          
          {/* Benefits of upgrading */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Upgrade to unlock:</p>
            <ul className="text-sm text-slate-600 space-y-1">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                More monthly searches
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                Higher daily limits
              </li>
            </ul>
          </div>
        </div>
        
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 sm:flex-none"
          >
            Close
          </Button>
          <Button
            onClick={handleUpgrade}
            className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none"
          >
            Upgrade Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 