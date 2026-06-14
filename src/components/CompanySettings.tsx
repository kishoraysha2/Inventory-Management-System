import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  Percent, 
  Check, 
  Lock, 
  Eye, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { AppPermissions, UserRole } from '../hooks/usePermission';

interface CompanyProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxRegistrationId: string;
  taxRatePercent: number;
  tradeName?: string;
  ownerName?: string;
  crNumber?: string;
  logo?: string;
}

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "Apex Global Supply Ltd.",
  address: "740 Industrial Boulevard, Suite C, Austin, TX 78701",
  phone: "+1 (512) 555-0193",
  email: "billing@apexsupply.com",
  website: "www.apexsupply.com",
  taxRegistrationId: "VAT-US948301140B",
  taxRatePercent: 15,
  tradeName: "Apex Global Supply",
  ownerName: "Apex Global LLC",
  crNumber: "CR-1010349283",
  logo: ""
};

interface CompanySettingsProps {
  userRole: UserRole | string;
  permissions: AppPermissions;
}

export default function CompanySettings({ userRole, permissions }: CompanySettingsProps) {
  const [profile, setProfile] = useState<CompanyProfile>(() => {
    const saved = localStorage.getItem('invoice_company_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load saved company profile", e);
      }
    }
    return DEFAULT_COMPANY_PROFILE;
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const isReadOnly = !permissions.manageSettings;

  // Load from Firestore
  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        setIsLoading(true);
        const snapshot = await getDoc(doc(db, 'businessProfile', 'config'));
        if (snapshot.exists()) {
          const data = snapshot.data();
          const loadedProfile = {
            name: data.name || DEFAULT_COMPANY_PROFILE.name,
            address: data.address || DEFAULT_COMPANY_PROFILE.address,
            phone: data.phone || DEFAULT_COMPANY_PROFILE.phone,
            email: data.email || DEFAULT_COMPANY_PROFILE.email,
            website: data.website || DEFAULT_COMPANY_PROFILE.website,
            taxRegistrationId: data.taxRegistrationId || DEFAULT_COMPANY_PROFILE.taxRegistrationId,
            taxRatePercent: typeof data.taxRatePercent === 'number' ? data.taxRatePercent : DEFAULT_COMPANY_PROFILE.taxRatePercent,
            tradeName: data.tradeName || '',
            ownerName: data.ownerName || '',
            crNumber: data.crNumber || '',
            logo: data.logo || ''
          };
          setProfile(loadedProfile);
          localStorage.setItem('invoice_company_profile', JSON.stringify(loadedProfile));
        }
      } catch (err) {
        console.error("Failed to fetch company profile from Firestore:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCompanyProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const cleanProfile = {
        name: profile.name.trim(),
        tradeName: profile.tradeName ? profile.tradeName.trim() : '',
        ownerName: profile.ownerName ? profile.ownerName.trim() : '',
        taxRegistrationId: profile.taxRegistrationId.trim(),
        crNumber: profile.crNumber ? profile.crNumber.trim() : '',
        address: profile.address.trim(),
        phone: profile.phone.trim(),
        email: profile.email ? profile.email.trim() : '',
        website: profile.website ? profile.website.trim() : '',
        logo: profile.logo ? profile.logo.trim() : '',
        taxRatePercent: Number(profile.taxRatePercent) || 0
      };

      if (auth.currentUser) {
        await setDoc(doc(db, 'businessProfile', 'config'), cleanProfile);
      }
      localStorage.setItem('invoice_company_profile', JSON.stringify(cleanProfile));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3500);
    } catch (err) {
      console.error("Failed to save Company Profile:", err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin"></div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading corporate profile configuration...</p>
      </div>
    );
  }

  return (
    <div id="company-settings-section" className="space-y-8 max-w-4xl mx-auto py-4">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100/50 shadow-3xs">
            <Building2 className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Company Settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage regional tax certificates, licensing data, contacts, and branch settings</p>
          </div>
        </div>

        {/* Permission Indicators */}
        <div className="flex items-center gap-2 self-start md:self-center">
          {isReadOnly ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <Eye className="h-3 w-3 text-slate-400" />
              Read Only Access ({userRole})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
              <Check className="h-3 w-3 text-emerald-500" />
              Read & Write Access
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* SECTION 1: CORPORATE IDENTITY */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-3xs">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Building2 className="h-4.5 w-4.5 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Corporate Identity</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Business Name <span className="text-rose-500">*</span></label>
              <input 
                type="text"
                required
                disabled={isReadOnly}
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200/80 py-2.5 px-3.5 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Apex Global Supply Ltd."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Trade Name</label>
              <input 
                type="text"
                disabled={isReadOnly}
                value={profile.tradeName || ''}
                onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
                className="w-full rounded-xl border border-slate-200/80 py-2.5 px-3.5 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Apex Trading"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Owner Name</label>
              <input 
                type="text"
                disabled={isReadOnly}
                value={profile.ownerName || ''}
                onChange={(e) => setProfile({ ...profile, ownerName: e.target.value })}
                className="w-full rounded-xl border border-slate-200/80 py-2.5 px-3.5 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Apex Holdings LLC"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">CR Number (Commercial Registration)</label>
              <input 
                type="text"
                disabled={isReadOnly}
                value={profile.crNumber || ''}
                onChange={(e) => setProfile({ ...profile, crNumber: e.target.value })}
                className="w-full rounded-xl border border-slate-200/80 py-2.5 px-3.5 text-xs font-semibold font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="CR-1010349283"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: CONTACT INFORMATION */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-3xs">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <MapPin className="h-4.5 w-4.5 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Contact Information</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">HQ Physical Address <span className="text-rose-500">*</span></label>
              <textarea 
                rows={2}
                required
                disabled={isReadOnly}
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                className="w-full rounded-xl border border-slate-200/80 py-2.5 px-3.5 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 leading-relaxed"
                placeholder="740 Industrial Boulevard, Suite C, Austin, TX 78701"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Telephone Contact <span className="text-rose-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-3"><Phone className="h-3.5 w-3.5 text-slate-400" /></span>
                <input 
                  type="text"
                  required
                  disabled={isReadOnly}
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-200/80 py-2.5 pl-9 pr-3.5 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="+1 (512) 555-0193"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Email Address</label>
              <div className="relative">
                <span className="absolute left-3 top-3"><Mail className="h-3.5 w-3.5 text-slate-400" /></span>
                <input 
                  type="email"
                  disabled={isReadOnly}
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200/80 py-2.5 pl-9 pr-3.5 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="billing@apexsupply.com"
                />
              </div>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Website URL</label>
              <div className="relative">
                <span className="absolute left-3 top-3"><Globe className="h-3.5 w-3.5 text-slate-400" /></span>
                <input 
                  type="text"
                  disabled={isReadOnly}
                  value={profile.website || ''}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                  className="w-full rounded-xl border border-slate-200/80 py-2.5 pl-9 pr-3.5 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="www.apexsupply.com"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: TAX CONFIGURATION */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-3xs">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Percent className="h-4.5 w-4.5 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Tax Configuration</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">VAT Registration Number <span className="text-rose-500">*</span></label>
              <input 
                type="text"
                required
                disabled={isReadOnly}
                value={profile.taxRegistrationId}
                onChange={(e) => setProfile({ ...profile, taxRegistrationId: e.target.value })}
                className="w-full rounded-xl border border-slate-200/80 py-2.5 px-3.5 text-xs font-bold font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="VAT-US948301140B"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Default VAT Rate (%)</label>
              <div className="relative">
                <input 
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  disabled={isReadOnly}
                  value={profile.taxRatePercent}
                  onChange={(e) => setProfile({ ...profile, taxRatePercent: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-slate-200/80 py-2.5 pl-3.5 pr-8 text-xs font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="15"
                />
                <span className="absolute right-3.5 top-2.5 text-slate-400 text-xs font-bold">%</span>
              </div>
              <p className="text-[10px] text-slate-400">Standard tax rate percentage applied dynamically to computed tax sales invoices</p>
            </div>
          </div>
        </div>

        {/* SECTION 4: BRANDING */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-3xs">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText className="h-4.5 w-4.5 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Branding & Identity</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Company Logo URL</label>
              <input 
                type="text"
                disabled={isReadOnly}
                value={profile.logo || ''}
                onChange={(e) => setProfile({ ...profile, logo: e.target.value })}
                className="w-full rounded-xl border border-slate-200/80 py-2.5 px-3.5 text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="https://example.com/logo.png"
              />
              <p className="text-[10px] text-slate-400">Upload your logo online and provide the public hotlinked path to render custom brand vectors directly onto invoices and output sheets.</p>
            </div>

            {/* Live Preview Pane */}
            <div className="border border-slate-200/80 rounded-2xl bg-slate-50/50 p-4.5 flex flex-col items-center justify-center text-center space-y-1.5 min-h-[110px]">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Live Logo Preview</span>
              {profile.logo ? (
                <div className="bg-white border border-slate-200/50 p-2.5 rounded-xl max-h-16 flex items-center justify-center">
                  <img 
                    src={profile.logo} 
                    alt="Live Logo Preview" 
                    referrerPolicy="no-referrer"
                    className="max-h-12 max-w-[120px] object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 italic">No Logo Set</div>
              )}
            </div>
          </div>
        </div>

        {/* FEEDBACK & SAVE ACTION ROW */}
        {!isReadOnly && (
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3.5 pt-2">
            
            {saveStatus === 'success' && (
              <div className="w-full sm:w-auto rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800 flex items-center gap-1.5 animate-slide-up">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>Business settings successfully synchronized both locally and in Cloud Firestore!</span>
              </div>
            )}

            {saveStatus === 'error' && (
              <div className="w-full sm:w-auto rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-800 flex items-center gap-1.5 animate-slide-up">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>An error occurred while saving profile settings to corporate databases.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-black text-white px-8 py-3 transition hover:shadow-md cursor-pointer disabled:opacity-60 uppercase tracking-wider"
            >
              <Lock className="h-4 w-4 shrink-0" />
              <span>{isSaving ? 'Synchronizing Cloud...' : 'Apply settings parameters'}</span>
            </button>
          </div>
        )}

      </form>
    </div>
  );
}
