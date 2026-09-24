import React, { useState, useEffect } from 'react';
import { Share2, Copy, Check, Users, Gift, TrendingUp, QrCode, MessageCircle } from 'lucide-react';
import QRCode from 'qrcode';

/**
 * PHASE 35: Referral Dashboard Component
 * Shows referral code, stats, and share options
 */
const ReferralDashboard = ({ profileId }) => {
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, [profileId]);

  const fetchReferralData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001/api';

      const response = await fetch(`${backendUrl}/profiles/${profileId}/referral-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch referral data');

      const data = await response.json();
      setReferralData(data);

      // Generate QR code
      const qrUrl = await QRCode.toDataURL(data.referral_url, {
        width: 300,
        margin: 2,
        color: {
          dark: '#9333EA',
          light: '#FFFFFF'
        }
      });
      setQrCodeUrl(qrUrl);

    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaWhatsApp = () => {
    if (!referralData) return;
    
    const message = encodeURIComponent(
      `🎊 Create your own beautiful wedding invitation like mine!\n\n` +
      `Use my code "${referralData.referral_code}" and get 50 free credits!\n\n` +
      `${referralData.referral_link_short}`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-gray-600">Loading referral data...</span>
        </div>
      </div>
    );
  }

  if (!referralData) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <p className="text-gray-600">Failed to load referral data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Refer & Earn Credits</h2>
            <p className="text-purple-100">
              Share your referral code and earn 200 credits for each friend who creates an invitation!
            </p>
          </div>
          <Gift className="w-12 h-12 opacity-80" />
        </div>

        {/* Referral Code Display */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
          <label className="text-sm text-purple-100 mb-2 block">Your Referral Code</label>
          <div className="flex items-center gap-3">
            <code className="text-3xl font-bold tracking-wider flex-1">
              {referralData.referral_code}
            </code>
            <button
              onClick={() => copyToClipboard(referralData.referral_code)}
              className="bg-white text-purple-600 px-4 py-2 rounded-lg hover:bg-purple-50 transition-colors flex items-center gap-2"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Referrals</p>
              <p className="text-3xl font-bold text-gray-900">{referralData.total_referrals}</p>
            </div>
            <Users className="w-10 h-10 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Completed</p>
              <p className="text-3xl font-bold text-green-600">{referralData.completed_referrals}</p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Credits Earned</p>
              <p className="text-3xl font-bold text-purple-600">{referralData.total_credits_earned}</p>
            </div>
            <Gift className="w-10 h-10 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Share Options */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Share2 className="w-5 h-5" />
          Share Your Referral Link
        </h3>

        <div className="space-y-4">
          {/* Referral Link */}
          <div>
            <label className="text-sm text-gray-600 mb-2 block">Referral Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={referralData.referral_link_short}
                readOnly
                className="flex-1 px-4 py-2 border rounded-lg bg-gray-50 text-sm"
              />
              <button
                onClick={() => copyToClipboard(referralData.referral_link_short)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy
              </button>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={shareViaWhatsApp}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              Share via WhatsApp
            </button>

            <button
              onClick={() => setShowQR(!showQR)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <QrCode className="w-5 h-5" />
              {showQR ? 'Hide QR Code' : 'Show QR Code'}
            </button>
          </div>

          {/* QR Code */}
          {showQR && qrCodeUrl && (
            <div className="mt-4 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <p className="text-sm text-gray-600 mb-4 text-center">
                Scan this QR code to share your referral link
              </p>
              <div className="flex justify-center">
                <img
                  src={qrCodeUrl}
                  alt="Referral QR Code"
                  className="rounded-lg shadow-lg"
                />
              </div>
              <p className="text-xs text-gray-500 mt-4 text-center">
                Code: {referralData.referral_code}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 border border-purple-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              1
            </div>
            <div>
              <p className="font-medium text-gray-900">Share your referral code</p>
              <p className="text-sm text-gray-600">Send your unique code to friends getting married</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              2
            </div>
            <div>
              <p className="font-medium text-gray-900">They create their invitation</p>
              <p className="text-sm text-gray-600">Your friend uses your code and gets 50 free credits</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
              3
            </div>
            <div>
              <p className="font-medium text-gray-900">You both earn credits!</p>
              <p className="text-sm text-gray-600">You get 200 credits, they get 50 credits to unlock features</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralDashboard;
