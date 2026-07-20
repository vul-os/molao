import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, Lock } from "lucide-react";
import { Layout } from '@/components/layout/auth-layout';

const MINIMUM_PASSWORD_LENGTH = 8;

const UpdatePassword = () => {
  const { updateUserPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

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
    setValidationError('');

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setValidationError(passwordError);
      return;
    }

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
    <Layout>
      <div className="flex min-h-screen bg-white">
        <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-16 xl:px-24">
          <div className="max-w-md w-full mx-auto space-y-8">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <img
                src="/api/placeholder/120/40"
                alt="Nuamic"
                className="h-10"
              />
            </div>

            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                  Update your password
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  Choose a strong password to secure your account
                </p>
              </div>

              {validationError && (
                <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                  {validationError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-1">
                  <Label htmlFor="newPassword" className="text-sm font-medium text-gray-700">
                    New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={handlePasswordChange}
                      disabled={isLoading}
                      required
                      className="pl-10 h-12 w-full border border-gray-200"
                      placeholder="Enter your new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="confirmNewPassword" className="text-sm font-medium text-gray-700">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      id="confirmNewPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      className="pl-10 h-12 w-full border border-gray-200"
                      placeholder="Confirm your new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 mb-2">Password Requirements:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li className="flex items-center">
                      <span className="mr-2">•</span>
                      At least {MINIMUM_PASSWORD_LENGTH} characters long
                    </li>
                    <li className="flex items-center">
                      <span className="mr-2">•</span>
                      One uppercase letter
                    </li>
                    <li className="flex items-center">
                      <span className="mr-2">•</span>
                      One lowercase letter
                    </li>
                    <li className="flex items-center">
                      <span className="mr-2">•</span>
                      One number
                    </li>
                    <li className="flex items-center">
                      <span className="mr-2">•</span>
                      One special character
                    </li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-lg transition-colors"
                    disabled={isLoading || !!validationError}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Updating Password...
                      </div>
                    ) : (
                      'Update Password'
                    )}
                  </Button>

                  <Button 
                    type="button"
                    variant="outline"
                    className="w-full h-12 hover:bg-gray-50"
                    onClick={() => navigate('/signin')}
                    disabled={isLoading}
                  >
                    Back to Sign In
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right Side - Content */}
        <div className="hidden lg:block lg:w-1/2 bg-gray-50">
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <h2 className="text-3xl font-semibold text-gray-900 mb-4">
                Secure Your Account
              </h2>
              <p className="text-gray-600">
                Protect your legal practice with a strong password. We implement industry-standard security measures to keep your data safe.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default UpdatePassword;