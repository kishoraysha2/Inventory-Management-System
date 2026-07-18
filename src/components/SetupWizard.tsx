import React, { useState } from 'react';
import { 
  Box, 
  Building2, 
  UserCheck, 
  Shield, 
  ChevronRight, 
  ChevronLeft, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Check, 
  Mail, 
  Phone, 
  MapPin, 
  Globe 
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { seedRolePermissions } from '../hooks/usePermission';
import { logSystemActivity } from '../lib/firebase';

interface SetupWizardProps {
  db: any;
  auth: any;
  onComplete: (user: User) => void;
}

export default function SetupWizard({ db, auth, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<number>(1);
  
  // Step 2: Company Information
  const [companyName, setCompanyName] = useState('');
  const [businessType, setBusinessType] = useState('Retail');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [currency, setCurrency] = useState('USD ($)');
  const [timezone, setTimezone] = useState('UTC');

  // Step 3: Owner Account
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerAuthMethod, setOwnerAuthMethod] = useState<'password' | 'google'>('password');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleNextStep = () => {
    if (step === 2) {
      if (!companyName.trim() || !businessType.trim() || !address.trim() || !phone.trim() || !email.trim()) {
        setSubmitError('Please fill in all required company information.');
        return;
      }
    }
    setSubmitError(null);
    setStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setSubmitError(null);
    setStep(prev => prev - 1);
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !ownerPhone.trim()) {
      setSubmitError('Please provide the Owner\'s Full Name and Phone Number.');
      return;
    }

    if (ownerAuthMethod === 'password') {
      if (!ownerEmail.trim() || !ownerPassword) {
        setSubmitError('Please provide both the Owner\'s Email and Password.');
        return;
      }
      if (ownerPassword.length < 6) {
        setSubmitError('Password must be at least 6 characters long.');
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let loggedInUser: User | null = null;

      if (ownerAuthMethod === 'password') {
        const credential = await createUserWithEmailAndPassword(auth, ownerEmail.trim(), ownerPassword);
        loggedInUser = credential.user;
      } else {
        const provider = new GoogleAuthProvider();
        const credential = await signInWithPopup(auth, provider);
        loggedInUser = credential.user;
      }

      if (!loggedInUser) {
        throw new Error('Authentication failed. Please try again.');
      }

      const userUid = loggedInUser.uid;
      const finalEmail = loggedInUser.email || ownerEmail.trim();

      // 1. Create Owner User Document
      await setDoc(doc(db, 'users', userUid), {
        name: ownerName.trim() || loggedInUser.displayName || 'Owner',
        email: finalEmail,
        phone: ownerPhone.trim() || '',
        role: 'owner',
        createdAt: new Date().toISOString()
      });

      // 2. Create Company Profile Config (businessProfile/config)
      const cleanProfile = {
        name: companyName.trim(),
        tradeName: companyName.trim(),
        ownerName: ownerName.trim() || loggedInUser.displayName || 'Owner',
        taxRegistrationId: taxNumber.trim() || '',
        crNumber: '',
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim() || finalEmail,
        website: '',
        logo: '',
        taxRatePercent: 15,
        currency,
        timezone,
        businessType
      };
      await setDoc(doc(db, 'businessProfile', 'config'), cleanProfile);

      // 3. Write Bootstrap Recovery / Installation Audit Log
      await logSystemActivity(
        "Bootstrap Recovery", 
        "Bootstrap Recovery:\nRoot administrator promoted to Owner because no Owner existed."
      );

      // 4. Seed standard role permissions templates
      await seedRolePermissions();

      // 4.5. Set bootstrap.initialized = true in system/bootstrap
      await setDoc(doc(db, 'system', 'bootstrap'), {
        initialized: true,
        updatedAt: new Date().toISOString()
      });

      // 5. Complete Setup & notify App container
      onComplete(loggedInUser);
    } catch (err: any) {
      console.error('Failed to complete ERP installation:', err);
      let errMsg = err.message || 'An unexpected error occurred during ERP installation.';
      if (err.code === 'auth/email-already-in-use') {
        errMsg = 'The specified owner email is already registered inside Firebase Authentication.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = 'The provided password is too weak. Please use at least 6 characters.';
      }
      setSubmitError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="setup-wizard-gate" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-[2.5rem] p-8 sm:p-12 shadow-xl space-y-8">
        
        {/* Header Block */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-md mx-auto animate-pulse">
            <Box className="h-7 w-7" />
          </div>
          <h1 className="font-sans text-2xl sm:text-3xl font-black tracking-tight text-slate-900 uppercase">
            NEXUS ERP INSTALLATION
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Commercial Deployment Setup Wizard
          </p>

          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-3 pt-4">
            <span className={`w-2.5 h-2.5 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-200'} transition-all duration-300`} />
            <span className="w-8 h-0.5 bg-slate-200" />
            <span className={`w-2.5 h-2.5 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-200'} transition-all duration-300`} />
            <span className="w-8 h-0.5 bg-slate-200" />
            <span className={`w-2.5 h-2.5 rounded-full ${step >= 3 ? 'bg-indigo-600' : 'bg-slate-200'} transition-all duration-300`} />
          </div>
        </div>

        {/* Feedback Area */}
        {submitError && (
          <div id="setup-error-container" className="p-4 rounded-2xl border text-xs font-medium flex items-center gap-2 bg-rose-50 border-rose-100 text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* STEP 1: WELCOME */}
        {step === 1 && (
          <div id="setup-step-1" className="space-y-6 text-center">
            <div className="space-y-3 text-slate-600 text-sm leading-relaxed max-w-md mx-auto">
              <p className="font-semibold text-slate-800 text-base">
                Welcome to your brand-new ERP installation.
              </p>
              <p>
                The Nexus Enterprise Resource Planning suite has detected a fresh database environment. We will help you initialize your corporate profile, configure localized default parameters, and create the master first Owner account.
              </p>
              <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100">
                This dynamic setup process completely removes all hardcoded developer credential requirements, enabling complete commercial independence for your company.
              </p>
            </div>

            <div className="pt-4">
              <button
                id="setup-btn-welcome-next"
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 text-sm font-bold transition shadow-xs hover:shadow-md cursor-pointer transition-all duration-200"
              >
                <span>Begin Installation Wizard</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: COMPANY INFORMATION */}
        {step === 2 && (
          <div id="setup-step-2" className="space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-800 uppercase flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <span>1. Corporate & Business Profile</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure your general branch configuration, local currency preferences, and default values.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Company Legal Name *
                </label>
                <input
                  id="setup-company-name"
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Apex Trading LLC"
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Business / Sector Type *
                </label>
                <select
                  id="setup-business-type"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none cursor-pointer"
                >
                  <option value="Retail">Retail Trade</option>
                  <option value="Wholesale">Wholesale Distribution</option>
                  <option value="Manufacturing">Manufacturing & Production</option>
                  <option value="Services">Professional Services</option>
                  <option value="Technology">Technology & Software</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Corporate HQ Address *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
                  <input
                    id="setup-address"
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 100 Main St, Suite 400, New York, NY"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Primary Phone *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
                  <input
                    id="setup-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 019-2834"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Corporate Contact Email *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
                  <input
                    id="setup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. corporate@apex-trading.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Tax / VAT Registry Number (Optional)
                </label>
                <input
                  id="setup-tax-id"
                  type="text"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  placeholder="e.g. VAT-9823102"
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Currency *
                  </label>
                  <select
                    id="setup-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-xs bg-slate-50 focus:bg-white text-slate-900 outline-none cursor-pointer font-bold"
                  >
                    <option value="USD ($)">USD ($)</option>
                    <option value="EUR (€)">EUR (€)</option>
                    <option value="SAR (SR)">SAR (SR)</option>
                    <option value="GBP (£)">GBP (£)</option>
                    <option value="AED (DH)">AED (DH)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Timezone *
                  </label>
                  <select
                    id="setup-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-xs bg-slate-50 focus:bg-white text-slate-900 outline-none cursor-pointer font-bold"
                  >
                    <option value="UTC">UTC (GMT+0)</option>
                    <option value="EST (UTC-5)">EST (UTC-5)</option>
                    <option value="PST (UTC-8)">PST (UTC-8)</option>
                    <option value="GST (UTC+4)">GST (UTC+4)</option>
                    <option value="AST (UTC+3)">AST (UTC+3)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Step Navigation Button Footer */}
            <div className="pt-6 flex justify-end gap-3">
              <button
                id="setup-btn-company-prev"
                type="button"
                onClick={handlePrevStep}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-3 text-xs font-bold transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                id="setup-btn-company-next"
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: OWNER ACCOUNT */}
        {step === 3 && (
          <form onSubmit={handleLaunch} id="setup-step-3" className="space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-800 uppercase flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <span>2. Owner Master Profile</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configure your high-level administrator identity. This account receives absolute system-wide clearances.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Full Name *
                </label>
                <input
                  id="setup-owner-name"
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Direct Phone *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
                  <input
                    id="setup-owner-phone"
                    type="tel"
                    required
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 012-9988"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Secure Clearance Authentication Method
                </label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <button
                    id="setup-auth-method-password"
                    type="button"
                    onClick={() => setOwnerAuthMethod('password')}
                    className={`px-4 py-3 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      ownerAuthMethod === 'password'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Mail className="w-4 h-4 shrink-0" />
                    <span>Email & Password</span>
                  </button>

                  <button
                    id="setup-auth-method-google"
                    type="button"
                    onClick={() => setOwnerAuthMethod('google')}
                    className={`px-4 py-3 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      ownerAuthMethod === 'google'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    <span>Google Single Sign-On</span>
                  </button>
                </div>
              </div>

              {ownerAuthMethod === 'password' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Owner Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
                      <input
                        id="setup-owner-email"
                        type="email"
                        required
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        placeholder="e.g. owner@apex-trading.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Master Password *
                    </label>
                    <div className="relative">
                      <input
                        id="setup-owner-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition duration-150 text-sm bg-slate-50 focus:bg-white text-slate-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-center text-xs text-indigo-900/80 leading-relaxed font-semibold">
                  You have selected Google Single Sign-On. After clicking "Complete Setup & Launch" below, you will authenticate using Google, and your Google account email will automatically be assigned as the system\'s ultimate Owner.
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
              <button
                id="setup-btn-owner-prev"
                type="button"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-3 text-xs font-bold transition cursor-pointer disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                id="setup-btn-owner-launch"
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 text-sm font-black transition shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Bootstrapping Services...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Complete Setup & Launch ERP</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
