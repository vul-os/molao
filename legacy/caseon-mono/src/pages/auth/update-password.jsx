import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle } from "lucide-react";

const MINIMUM_PASSWORD_LENGTH = 8;

const UpdatePassword = () => {
  const { updateUserPassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const validatePassword = (password) => {
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      return `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters long`;
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return '';
  };

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setNewPassword(password);
    setValidationError(validatePassword(password));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Clear any existing validation errors
    setValidationError('');

    // Validate password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setValidationError(passwordError);
      return;
    }

    // Check if passwords match
    if (newPassword !== confirmNewPassword) {
      setValidationError('New password and confirmation do not match');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await updateUserPassword(newPassword);
      
      if (error) throw error;

      toast({
        title: "Success",
        description: "Your password has been successfully updated.",
        duration: 5000,
      });

      // Redirect to login after successful password update
      setTimeout(() => navigate('/signin'), 1500);
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update password. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-md mt-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Update Password</CardTitle>
          <CardDescription>
            Choose a strong password that meets all the requirements below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={handlePasswordChange}
                disabled={isLoading}
                required
                className="w-full"
                placeholder="Enter your new password"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmNewPassword" className="text-sm font-medium">
                Confirm New Password
              </label>
              <Input
                id="confirmNewPassword"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                disabled={isLoading}
                required
                className="w-full"
                placeholder="Confirm your new password"
              />
            </div>

            <div className="text-sm space-y-2 text-muted-foreground">
              <p>Password must:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Be at least {MINIMUM_PASSWORD_LENGTH} characters long</li>
                <li>Include at least one uppercase letter</li>
                <li>Include at least one lowercase letter</li>
                <li>Include at least one number</li>
                <li>Include at least one special character</li>
              </ul>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !!validationError}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                'Update Password'
              )}
            </Button>

            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => navigate('/signin')}
              disabled={isLoading}
              type="button"
            >
              Back to Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default UpdatePassword;