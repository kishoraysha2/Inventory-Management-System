import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  Phone, 
  Mail, 
  Globe, 
  Percent, 
  Check, 
  Lock, 
  FileText,
  AlertCircle,
  Paintbrush,
  Search,
  ChevronDown
} from 'lucide-react';
import { formatCurrency } from '../../../utils/currencyFormatter';

export interface CompanyProfile {
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
  businessType: string;
  currency: string;
  timezone: string;
  country?: string;
  accentColor?: string;
  theme?: string;
  dateFormat?: string;
  numberFormat?: string;
  language?: string;
  currencyName?: string;
  currencyCode?: string;
  currencySymbol?: string;
  currencyPosition?: string;
  decimalPrecision?: number;
  thousandsSeparator?: string;
  decimalSeparator?: string;
}

interface CompanyProfileTabProps {
  profile: CompanyProfile;
  setProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>;
  isReadOnly: boolean;
  isSaving: boolean;
  saveStatus: 'idle' | 'success' | 'error';
  handleSave: (e: React.FormEvent) => Promise<void>;
}

export default function CompanyProfileTab({
  profile,
  setProfile,
  isReadOnly,
  isSaving,
  saveStatus,
  handleSave
}: CompanyProfileTabProps) {
  // --- COUNTRY SELECTOR STATE & LOGIC ---
  const [countrySearch, setCountrySearch] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  const COUNTRY_OPTIONS = useMemo(() => [
    { name: 'Bangladesh', code: 'BD', currency: 'BDT (৳)', currencyName: 'Bangladeshi Taka', currencyCode: 'BDT', currencySymbol: '৳', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'BST (UTC+6)' },
    { name: 'Saudi Arabia (KSA)', code: 'SA', currency: 'SAR (﷼)', currencyName: 'Saudi Riyal', currencyCode: 'SAR', currencySymbol: '﷼', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'AST (UTC+3)' },
    { name: 'United Arab Emirates (UAE)', code: 'AE', currency: 'AED (د.إ)', currencyName: 'UAE Dirham', currencyCode: 'AED', currencySymbol: 'د.إ', currencyPosition: 'After', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'GST (UTC+4)' },
    { name: 'United States (USA)', code: 'US', currency: 'USD ($)', currencyName: 'US Dollar', currencyCode: 'USD', currencySymbol: '$', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'EST (UTC-5)' },
    { name: 'United Kingdom (UK)', code: 'GB', currency: 'GBP (£)', currencyName: 'British Pound', currencyCode: 'GBP', currencySymbol: '£', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'UTC (GMT+0)' },
    { name: 'European Union', code: 'EU', currency: 'EUR (€)', currencyName: 'Euro', currencyCode: 'EUR', currencySymbol: '€', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: '.', decimalSeparator: ',', timezone: 'CET (UTC+1)' },
    { name: 'India', code: 'IN', currency: 'INR (₹)', currencyName: 'Indian Rupee', currencyCode: 'INR', currencySymbol: '₹', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'IST (UTC+5.5)' },
    { name: 'Qatar', code: 'QA', currency: 'QAR (ر.ق)', currencyName: 'Qatari Riyal', currencyCode: 'QAR', currencySymbol: 'ر.ق', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'AST (UTC+3)' },
    { name: 'Kuwait', code: 'KW', currency: 'KWD (د.ك)', currencyName: 'Kuwaiti Dinar', currencyCode: 'KWD', currencySymbol: 'د.ك', currencyPosition: 'Before', decimalPrecision: 3, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'AST (UTC+3)' },
    { name: 'Malaysia', code: 'MY', currency: 'MYR (RM)', currencyName: 'Malaysian Ringgit', currencyCode: 'MYR', currencySymbol: 'RM', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'MYT (UTC+8)' },
    { name: 'Singapore', code: 'SG', currency: 'SGD (S$)', currencyName: 'Singapore Dollar', currencyCode: 'SGD', currencySymbol: 'S$', currencyPosition: 'Before', decimalPrecision: 2, thousandsSeparator: ',', decimalSeparator: '.', timezone: 'SGT (UTC+8)' }
  ], []);

  const filteredCountries = useMemo(() => {
    return COUNTRY_OPTIONS.filter(c => 
      c.name.toLowerCase().includes(countrySearch.toLowerCase())
    );
  }, [COUNTRY_OPTIONS, countrySearch]);

  const getTimezoneOptions = (countryName: string) => {
    if (countryName === 'Saudi Arabia (KSA)') {
      return ['AST (UTC+3)'];
    } else if (countryName === 'United Arab Emirates (UAE)') {
      return ['GST (UTC+4)'];
    } else if (countryName === 'United States (USA)') {
      return ['EST (UTC-5)', 'PST (UTC-8)', 'CST (UTC-6)', 'MST (UTC-7)'];
    } else if (countryName === 'United Kingdom (UK)') {
      return ['UTC (GMT+0)'];
    } else if (countryName === 'Bangladesh') {
      return ['BST (UTC+6)'];
    } else if (countryName === 'European Union') {
      return ['CET (UTC+1)', 'EET (UTC+2)'];
    } else if (countryName === 'India') {
      return ['IST (UTC+5.5)'];
    } else if (countryName === 'Qatar') {
      return ['AST (UTC+3)'];
    } else if (countryName === 'Kuwait') {
      return ['AST (UTC+3)'];
    } else if (countryName === 'Malaysia') {
      return ['MYT (UTC+8)'];
    } else if (countryName === 'Singapore') {
      return ['SGT (UTC+8)'];
    }
    return [
      'UTC', 'AST (UTC+3)', 'GST (UTC+4)', 'EST (UTC-5)', 'PST (UTC-8)', 
      'CST (UTC-6)', 'MST (UTC-7)', 'CET (UTC+1)', 'EET (UTC+2)', 'BST (UTC+6)', 'IST (UTC+5.5)', 'MYT (UTC+8)', 'SGT (UTC+8)'
    ];
  };

  const handleCountrySelect = (countryName: string) => {
    const found = COUNTRY_OPTIONS.find(c => c.name === countryName);
    if (found) {
      setProfile(prev => ({
        ...prev,
        country: countryName,
        currency: found.currency,
        currencyName: found.currencyName,
        currencyCode: found.currencyCode,
        currencySymbol: found.currencySymbol,
        currencyPosition: found.currencyPosition,
        decimalPrecision: found.decimalPrecision,
        thousandsSeparator: found.thousandsSeparator,
        decimalSeparator: found.decimalSeparator,
        timezone: found.timezone
      }));
    } else {
      setProfile(prev => ({
        ...prev,
        country: countryName
      }));
    }
    setIsCountryDropdownOpen(false);
  };

  // Close country dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <form onSubmit={handleSave} className="space-y-6">
      
      {/* SECTION 1: Company Information */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
          <Building2 className="h-4.5 w-4.5 text-indigo-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">1. Company Information</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Business Name <span className="text-rose-500">*</span></label>
            <input 
              type="text"
              required
              disabled={isReadOnly}
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 pl-3.5 pr-3.5 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Apex Global Supply Ltd."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Trade Name</label>
            <input 
              type="text"
              disabled={isReadOnly}
              value={profile.tradeName || ''}
              onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Apex Trading"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Email Address</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400"><Mail className="h-3.5 w-3.5" /></span>
              <input 
                type="email"
                disabled={isReadOnly}
                value={profile.email || ''}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="billing@apexsupply.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Telephone Contact <span className="text-rose-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400"><Phone className="h-3.5 w-3.5" /></span>
              <input 
                type="text"
                required
                disabled={isReadOnly}
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="+1 (512) 555-0193"
              />
            </div>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">HQ Physical Address / Location <span className="text-rose-500">*</span></label>
            <textarea 
              rows={2}
              required
              disabled={isReadOnly}
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-medium focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 leading-relaxed"
              placeholder="740 Industrial Boulevard, Suite C, Austin, TX 78701"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: Business Configuration */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
          <Globe className="h-4.5 w-4.5 text-indigo-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">2. Business Configuration</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Searchable Country Selector */}
          <div className="space-y-1.5 relative" ref={countryDropdownRef}>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Operational Country <span className="text-rose-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400"><Globe className="h-3.5 w-3.5" /></span>
              <button
                type="button"
                id="country-selector-trigger"
                disabled={isReadOnly}
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-8 text-xs font-bold text-left focus:border-slate-450 flex items-center justify-between disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
              >
                <span>{profile.country || 'Select country...'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>

            {isCountryDropdownOpen && (
              <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 space-y-2 animate-fade-in">
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-400"><Search className="h-3 w-3" /></span>
                  <input
                    type="text"
                    placeholder="Search country..."
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-7 pr-2.5 text-xs focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0.5 divide-y divide-slate-50">
                  {filteredCountries.map(c => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => handleCountrySelect(c.name)}
                      className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-50 text-slate-700 rounded-lg flex items-center justify-between"
                    >
                      <span>{c.name}</span>
                      {profile.country === c.name && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                    </button>
                  ))}
                  {filteredCountries.length === 0 && (
                    <div className="p-2 text-[10px] text-slate-400 text-center italic">No matching countries</div>
                  )}
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-400">Selecting country triggers smart defaults for Currency and Timezones</p>
          </div>

          {/* Business Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Business Type <span className="text-rose-500">*</span></label>
            <select 
              id="settings-business-type"
              required
              disabled={isReadOnly}
              value={profile.businessType}
              onChange={(e) => setProfile({ ...profile, businessType: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
            >
              <option value="Retail">Retail Trade</option>
              <option value="Wholesale">Wholesale Distribution</option>
              <option value="Manufacturing">Manufacturing & Production</option>
              <option value="Services">Professional Services</option>
              <option value="Technology">Technology & Software</option>
            </select>
          </div>

          {/* Currency (with Manual Override Capability) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Local Currency (SAR, AED, USD, GBP) <span className="text-rose-500">*</span></label>
            <select 
              id="settings-currency"
              required
              disabled={isReadOnly}
              value={profile.currency}
              onChange={(e) => {
                const val = e.target.value;
                let sym = '$';
                let code = 'USD';
                let name = 'US Dollar';
                let pos = 'Before';
                let thousands = ',';
                let decimal = '.';
                let precision = 2;

                if (val === 'SAR (﷼)' || val === 'SAR (Classic)') { sym = '﷼'; code = 'SAR'; name = 'Saudi Riyal'; pos = 'Before'; }
                else if (val === 'SAR (SAR)' || val === 'SAR (ISO)') { sym = 'SAR'; code = 'SAR'; name = 'Saudi Riyal'; pos = 'After'; }
                else if (val === 'SAR (⃁)' || val === 'SAR (Official)' || val.includes('Official') || val.includes('⃁') || val.includes('New Symbol') || val.includes('U+20C1')) { sym = '\u20C1'; code = 'SAR'; name = 'Saudi Riyal'; pos = 'Before'; }
                else if (val.includes('SAR')) { sym = '﷼'; code = 'SAR'; name = 'Saudi Riyal'; pos = 'Before'; }
                else if (val.includes('AED')) { sym = 'د.إ'; code = 'AED'; name = 'UAE Dirham'; pos = 'After'; }
                else if (val.includes('GBP')) { sym = '£'; code = 'GBP'; name = 'British Pound'; }
                else if (val.includes('EUR')) { sym = '€'; code = 'EUR'; name = 'Euro'; thousands = '.'; decimal = ','; }
                else if (val.includes('JPY')) { sym = '¥'; code = 'JPY'; name = 'Japanese Yen'; precision = 0; }
                else if (val.includes('INR')) { sym = '₹'; code = 'INR'; name = 'Indian Rupee'; }
                else if (val.includes('BDT')) { sym = '৳'; code = 'BDT'; name = 'Bangladeshi Taka'; }
                else if (val.includes('QAR')) { sym = 'ر.ق'; code = 'QAR'; name = 'Qatari Riyal'; pos = 'After'; }
                else if (val.includes('KWD')) { sym = 'د.ك'; code = 'KWD'; name = 'Kuwaiti Dinar'; pos = 'After'; precision = 3; }
                else if (val.includes('MYR')) { sym = 'RM'; code = 'MYR'; name = 'Malaysian Ringgit'; }
                else if (val.includes('SGD')) { sym = 'S$'; code = 'SGD'; name = 'Singapore Dollar'; }

                setProfile({
                  ...profile,
                  currency: val,
                  currencyName: name,
                  currencyCode: code,
                  currencySymbol: sym,
                  currencyPosition: pos,
                  thousandsSeparator: thousands,
                  decimalSeparator: decimal,
                  decimalPrecision: precision
                });
              }}
              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
            >
              <option value="SAR (﷼)">SAR (﷼) - Saudi Riyal (Classic)</option>
              <option value="SAR (SAR)">SAR (SAR) - Saudi Riyal (ISO)</option>
              <option value="SAR (⃁)">SAR (⃁) - Official Saudi Riyal Symbol</option>
              <option value="AED (د.إ)">AED (د.إ) - UAE Dirham</option>
              <option value="USD ($)">USD ($) - US Dollar</option>
              <option value="GBP (£)">GBP (£) - British Pound</option>
              <option value="EUR (€)">EUR (€) - Euro Zone</option>
              <option value="JPY (¥)">JPY (¥) - Japanese Yen</option>
              <option value="INR (₹)">INR (₹) - Indian Rupee</option>
              <option value="BDT (৳)">BDT (৳) - Bangladeshi Taka</option>
              <option value="QAR (ر.ق)">QAR (ر.ق) - Qatari Riyal</option>
              <option value="KWD (د.ك)">KWD (د.ك) - Kuwaiti Dinar</option>
              <option value="MYR (RM)">MYR (RM) - Malaysian Ringgit</option>
              <option value="SGD (S$)">SGD (S$) - Singapore Dollar</option>
            </select>
            <p className="text-[10px] text-slate-400">Can be manually overridden if you operate using non-standard currencies</p>
          </div>

          {/* Timezone (with Manual Override/Country-filtered Options) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Corporate Timezone <span className="text-rose-500">*</span></label>
            <select 
              id="settings-timezone"
              required
              disabled={isReadOnly}
              value={profile.timezone}
              onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer"
            >
              {getTimezoneOptions(profile.country || '').map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
              {/* Always offer UTC fallback */}
              {!getTimezoneOptions(profile.country || '').includes('UTC') && (
                <option value="UTC">UTC (GMT+0) - Global standard</option>
              )}
            </select>
            <p className="text-[10px] text-slate-400">Filtered options match selected country. Safe override available.</p>
          </div>

          {/* Custom Advanced Localization Fields Sub-Section */}
          <div className="md:col-span-3 pt-5 mt-2 border-t border-slate-100">
            <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full"></span>
              Advanced Currency & Localized Display Formatter
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Currency Name</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={profile.currencyName || ''}
                  onChange={(e) => setProfile({ ...profile, currencyName: e.target.value })}
                  className="w-full bg-white rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none"
                  placeholder="e.g. Saudi Riyal"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Currency Code (ISO)</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={profile.currencyCode || ''}
                  onChange={(e) => setProfile({ ...profile, currencyCode: e.target.value })}
                  className="w-full bg-white rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none"
                  placeholder="e.g. SAR"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Currency Symbol</label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={profile.currencySymbol || ''}
                  onChange={(e) => setProfile({ ...profile, currencySymbol: e.target.value })}
                  className="w-full bg-white rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none"
                  placeholder="e.g. ﷼"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Symbol Position</label>
                <select
                  disabled={isReadOnly}
                  value={profile.currencyPosition || 'Before'}
                  onChange={(e) => setProfile({ ...profile, currencyPosition: e.target.value })}
                  className="w-full bg-white rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none cursor-pointer"
                >
                  <option value="Before">Before Amount (e.g. $1,250.00)</option>
                  <option value="After">After Amount (e.g. 1,250.00 $)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Decimal Precision</label>
                <select
                  disabled={isReadOnly}
                  value={profile.decimalPrecision ?? 2}
                  onChange={(e) => setProfile({ ...profile, decimalPrecision: parseInt(e.target.value, 10) })}
                  className="w-full bg-white rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none cursor-pointer"
                >
                  <option value={0}>0 Decimal Places (e.g. 1,250)</option>
                  <option value={2}>2 Decimal Places (e.g. 1,250.50)</option>
                  <option value={3}>3 Decimal Places (e.g. 1,250.500)</option>
                  <option value={4}>4 Decimal Places (e.g. 1,250.5000)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Thousands Separator</label>
                <select
                  disabled={isReadOnly}
                  value={profile.thousandsSeparator ?? ','}
                  onChange={(e) => setProfile({ ...profile, thousandsSeparator: e.target.value })}
                  className="w-full bg-white rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none cursor-pointer"
                >
                  <option value=",">Comma (,)</option>
                  <option value=".">Dot (.)</option>
                  <option value=" ">Space ( )</option>
                  <option value="None">None (No separator)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Decimal Separator</label>
                <select
                  disabled={isReadOnly}
                  value={profile.decimalSeparator || '.'}
                  onChange={(e) => setProfile({ ...profile, decimalSeparator: e.target.value })}
                  className="w-full bg-white rounded-xl border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-slate-450 focus:outline-none cursor-pointer"
                >
                  <option value=".">Dot (.)</option>
                  <option value=",">Comma (,)</option>
                </select>
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <div className="bg-white border border-slate-200/65 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Active Preview</span>
                    <span className="text-[10px] text-slate-500 font-medium">Sample: 1250.50</span>
                  </div>
                  <div className="text-xs font-black text-indigo-600 bg-indigo-50/50 px-2.5 py-1.5 rounded-lg border border-indigo-100 font-mono">
                    {formatCurrency(1250.50, profile)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: Compliance */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
          <Percent className="h-4.5 w-4.5 text-indigo-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">3. Compliance Certificates</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Commercial Registration (CR)</label>
            <input 
              type="text"
              disabled={isReadOnly}
              value={profile.crNumber || ''}
              onChange={(e) => setProfile({ ...profile, crNumber: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-bold font-mono focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="CR-1010349283"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">VAT ID / Tax Number <span className="text-rose-500">*</span></label>
            <input 
              type="text"
              required
              disabled={isReadOnly}
              value={profile.taxRegistrationId}
              onChange={(e) => setProfile({ ...profile, taxRegistrationId: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-bold font-mono focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="VAT-US948301140B"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Default Tax Rate (%) <span className="text-rose-500">*</span></label>
            <div className="relative">
              <input 
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                disabled={isReadOnly}
                value={profile.taxRatePercent}
                onChange={(e) => setProfile({ ...profile, taxRatePercent: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-xl border border-slate-200 py-2 pl-3.5 pr-8 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="15"
              />
              <span className="absolute right-3 top-2 text-slate-400 text-xs font-bold">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: Branding */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
          <Paintbrush className="h-4.5 w-4.5 text-indigo-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">4. Corporate Branding</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Logo URL */}
          <div className="md:col-span-2 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Company Logo URL</label>
              <input 
                type="text"
                disabled={isReadOnly}
                value={profile.logo || ''}
                onChange={(e) => setProfile({ ...profile, logo: e.target.value })}
                className="w-full rounded-xl border border-slate-200 py-2 px-3.5 text-xs font-semibold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="https://example.com/logo.png"
              />
              <p className="text-[10px] text-slate-400">Provide public hotlinked path to render custom corporate logo vectors directly on billing invoices</p>
            </div>

            {/* Brand Color Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Primary Brand Accent Color</label>
              <div className="flex items-center gap-3">
                {[
                  { name: 'indigo', hex: '#4F46E5', label: 'Indigo Classic' },
                  { name: 'emerald', hex: '#10B981', label: 'Emerald Forest' },
                  { name: 'amber', hex: '#F59E0B', label: 'Amber Gold' },
                  { name: 'rose', hex: '#F43F5E', label: 'Rose Red' },
                  { name: 'slate', hex: '#64748B', label: 'Corporate Slate' }
                ].map(c => (
                  <button
                    key={c.name}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setProfile({ ...profile, accentColor: c.name })}
                    className={`w-7 h-7 rounded-full transition-all flex items-center justify-center border hover:scale-110 active:scale-95 relative cursor-pointer`}
                    style={{ backgroundColor: c.hex, borderColor: profile.accentColor === c.name ? '#0f172a' : 'transparent' }}
                    title={c.label}
                  >
                    {profile.accentColor === c.name && (
                      <Check className="h-3.5 w-3.5 text-white stroke-[3px]" />
                    )}
                  </button>
                ))}
                <span className="text-[10px] text-slate-500 font-mono font-bold capitalize ml-2">Active: {profile.accentColor || 'indigo'}</span>
              </div>
            </div>
          </div>

          {/* Logo Live Preview */}
          <div className="border border-slate-200 rounded-2xl bg-slate-50/50 p-4 flex flex-col items-center justify-center text-center space-y-2 min-h-[110px]">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Invoice Brand Vector</span>
            {profile.logo ? (
              <div className="bg-white border border-slate-200/50 p-2.5 rounded-xl max-h-16 flex items-center justify-center shadow-3xs">
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
              <div className="text-[10px] text-slate-400 italic">No Logo Configured</div>
            )}
          </div>
        </div>

        {/* Theme Selector */}
        <div className="space-y-2.5 pt-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Dashboard Layout Workspace Theme</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: 'Light', desc: 'Sleek standard light interface style' },
              { name: 'Charcoal Dark', desc: 'Comfortable high-contrast twilight mode' },
              { name: 'Indigo Classic', desc: 'Signature workspace royal indigo' },
              { name: 'Emerald Forest', desc: 'Warm professional eco accent theme' }
            ].map(t => (
              <button
                key={t.name}
                type="button"
                disabled={isReadOnly}
                onClick={() => setProfile({ ...profile, theme: t.name })}
                className={`p-3 rounded-xl border text-left transition text-xs font-semibold hover:border-slate-400 cursor-pointer ${
                  profile.theme === t.name 
                    ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-3xs' 
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block">{t.name}</span>
                <span className="text-[8px] font-medium text-slate-400 mt-1 block leading-normal">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 5: System Preferences */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-3xs">
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
          <FileText className="h-4.5 w-4.5 text-indigo-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">5. System Preferences</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Date Formatting Code</label>
            <select 
              disabled={isReadOnly}
              value={profile.dateFormat}
              onChange={(e) => setProfile({ ...profile, dateFormat: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 cursor-pointer"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD (Standard KSA/US)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (European standard)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (US Legacy code)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Double-Entry Number Format</label>
            <select 
              disabled={isReadOnly}
              value={profile.numberFormat}
              onChange={(e) => setProfile({ ...profile, numberFormat: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 cursor-pointer"
            >
              <option value="1,234.56">1,234.56 (US/Standard Ledger)</option>
              <option value="1.234,56">1.234,56 (European style)</option>
              <option value="1234.56">1234.56 (Literal format)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Default Language Interface</label>
            <select 
              disabled={isReadOnly}
              value={profile.language}
              onChange={(e) => setProfile({ ...profile, language: e.target.value })}
              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-xs font-bold focus:border-slate-450 focus:outline-none disabled:bg-slate-50 cursor-pointer"
            >
              <option value="English">English (United States)</option>
              <option value="Arabic">Arabic (العربية)</option>
              <option value="Spanish">Spanish (Español)</option>
            </select>
          </div>
        </div>
      </div>

      {/* SAVE / SYNCHRONIZE CONTROL BAR */}
      {!isReadOnly && (
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3.5 pt-2">
          
          {saveStatus === 'success' && (
            <div className="w-full sm:w-auto rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-800 flex items-center gap-1.5 animate-slide-up">
              <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>Corporate settings synced successfully in Cloud Firestore!</span>
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="w-full sm:w-auto rounded-xl bg-rose-50 border border-rose-200 px-4 py-2 text-xs font-bold text-rose-800 flex items-center gap-1.5 animate-slide-up">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>An error occurred while saving profile settings.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-black text-white px-8 py-3 transition hover:shadow-md cursor-pointer disabled:opacity-60 uppercase tracking-wider"
          >
            <Lock className="h-4 w-4 shrink-0 text-indigo-400" />
            <span>{isSaving ? 'Synchronizing Cloud...' : 'Apply settings parameters'}</span>
          </button>
        </div>
      )}
    </form>
  );
}
