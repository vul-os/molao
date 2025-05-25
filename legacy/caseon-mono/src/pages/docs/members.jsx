import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Users, Shield, Settings, UserPlus } from 'lucide-react';

const Members = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif font-bold text-slate-900 mb-4">Team Management</h1>
      <p className="text-lg text-slate-600 mb-8">
        Learn how to manage your team members and control access to your legal research within CaseOn.
      </p>

      {/* Team Management Overview */}
      <div className="mb-10">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-4">Managing Your Team</h2>
        <p className="text-slate-600 mb-6">
          Team collaboration is available on both Associate and Partner plans, with enhanced management features available exclusively on the Partner plan. Easily add team members, assign roles, and manage permissions from a single dashboard.
        </p>

        {/* Members Interface Image */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
          <div className="bg-slate-100 px-4 py-2 text-xs font-medium text-slate-500 uppercase">
            Team Members Dashboard
          </div>
          <div className="p-4 bg-white">
            <div className="relative max-w-lg mx-auto rounded-lg overflow-hidden border border-slate-200">
              <img 
                src="/members.png" 
                alt="CaseOn Team Members Interface" 
                className="w-full h-auto max-h-[300px] object-contain" 
              />
            </div>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-8">
          <div className="flex items-start">
            <Users className="h-5 w-5 text-indigo-600 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-indigo-700">
              <strong>Available on paid plans:</strong> Team management features are available on Associate and Partner plans only, with billing access and advanced controls exclusive to the Partner plan. Upgrade your plan to access these collaboration tools.
            </p>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="mb-10">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-4">Key Features</h2>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <UserPlus className="h-5 w-5 text-indigo-600 mr-2" />
              Adding Team Members
            </h3>
            <p className="text-slate-600 mb-3">
              Easily invite colleagues to join your organization with a few simple steps.
            </p>
            <div className="bg-slate-50 rounded-lg p-4">
              <ol className="space-y-2 text-slate-600 list-decimal pl-5">
                <li>Navigate to the Members section from your dashboard</li>
                <li>Click the "Add Member" button in the top right</li>
                <li>Enter the email address of your colleague</li>
                <li>Select the appropriate role and permissions</li>
                <li>Click "Send Invitation" to deliver an email invitation</li>
              </ol>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <Shield className="h-5 w-5 text-indigo-600 mr-2" />
              Permission Management
            </h3>
            <p className="text-slate-600 mb-3">
              Control what team members can access and modify within your organization.
            </p>
            <div className="bg-slate-50 rounded-lg p-4">
              <table className="w-full text-sm text-slate-600">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-medium">Role</th>
                    <th className="text-left py-2 font-medium">Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-2 pr-4 font-medium">Partner</td>
                    <td className="py-2">Full access to all features, including billing, member management, and all premium research tools. This is the highest tier role with complete administrative control.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Associate</td>
                    <td className="py-2">Can perform searches, export documents, and invite team members, but cannot access billing or advanced management features.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-xl font-medium text-slate-800 mb-3 flex items-center">
              <Settings className="h-5 w-5 text-indigo-600 mr-2" />
              Team Settings
            </h3>
            <p className="text-slate-600 mb-3">
              Configure organization-wide settings to streamline your team's workflow.
            </p>
            <div className="bg-slate-50 rounded-lg p-4">
              <ul className="space-y-2 text-slate-600">
                <li className="flex items-start">
                  <span className="font-bold text-indigo-600 mr-2">•</span>
                  <span><strong>Default Permissions:</strong> Set default access levels for new team members</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold text-indigo-600 mr-2">•</span>
                  <span><strong>Login Security:</strong> Configure password policies and login requirements</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Tips Section */}
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-5 mb-10">
        <h3 className="text-lg font-medium text-amber-800 mb-2">Best Practices</h3>
        <ul className="space-y-2 text-amber-700">
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Regularly review team member access and remove inactive accounts</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Assign the minimum necessary permissions required for each role</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Require secure passwords and consider enabling two-factor authentication</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">•</span>
            <span>Maintain clear documentation of who has access to sensitive case information</span>
          </li>
        </ul>
      </div>

      <div className="border-t border-slate-200 pt-6 mt-8">
        <div className="flex justify-between items-center">
          <Link 
            to="/docs/search" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Previous: Search Guide
          </Link>
          <Link 
            to="/docs/contact" 
            className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Next: Contact Us
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Members; 