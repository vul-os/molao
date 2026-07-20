import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Mail, Eye, EyeOff, Lock } from 'lucide-react';

const SignInDialog = ({ isOpen = true, onClose = () => {} }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (formData.email === 'test@example.com' && formData.password === 'password') {
        onClose();
      } else {
        throw new Error('Invalid credentials');
      }
    } catch (error) {
      setErrors({
        submit: 'Invalid email or password'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      // Implement Google Sign-In logic here
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      setErrors({
        submit: 'Google sign-in failed. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-semibold">
            Welcome back
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            Sign in to access your account
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full border-gray-300 hover:bg-gray-50"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <img
              src="/api/placeholder/20/20"
              alt="Google"
              className="mr-2 h-5 w-5"
            />
            Continue with Google
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">or continue with email</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="pl-10"
                value={formData.email}
                onChange={handleInputChange}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                onClick={() => {}}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="pl-10 pr-10"
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {errors.submit && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
              {errors.submit}
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-black text-white hover:bg-gray-900"
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <button 
                type="button"
                onClick={() => {}} 
                className="text-black hover:underline font-medium"
              >
                Create an account
              </button>
            </p>
          </div>

          <div className="text-center text-xs text-gray-500 space-y-2 mt-6">
            <p>
              By continuing, you agree to our{' '}
              <button type="button" className="text-black hover:underline">Terms of Service</button>
              {' '}and{' '}
              <button type="button" className="text-black hover:underline">Privacy Policy</button>
            </p>
            <p>
              This site is protected by reCAPTCHA and the Google{' '}
              <button type="button" className="text-black hover:underline">Privacy Policy</button>
              {' '}and{' '}
              <button type="button" className="text-black hover:underline">Terms of Service</button>
              {' '}apply
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SignInDialog;