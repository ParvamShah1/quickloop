import { sendSMS } from './awsSnsService';

// Generate a random 6-digit OTP
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTPs with expiry time (5 minutes)
const otpStore: { [phoneNumber: string]: { otp: string; expiry: number } } = {};

// Send OTP via SMS using AWS SNS
export const sendOTP = async (phoneNumber: string): Promise<{ success: boolean; message: string }> => {
  try {
    // Validate phone number format (simple validation)
    if (!phoneNumber.match(/^\+[1-9]\d{1,14}$/)) {
      return { 
        success: false, 
        message: 'Invalid phone number format. Please use international format (e.g., +1234567890)' 
      };
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with 5-minute expiry
    otpStore[phoneNumber] = {
      otp,
      expiry: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    };

    // For development and testing, log the OTP to the console
    console.log(`[DEV MODE] OTP for ${phoneNumber}: ${otp}`);
    
    // Prepare message
    const message = `Your QuickLoop verification code is: ${otp}. Valid for 5 minutes.`;
    
    // Send SMS using our AWS SNS service
    const smsSent = await sendSMS(phoneNumber, message);
    
    return {
      success: true,
      message: smsSent ? 'OTP sent successfully' : 'OTP generated (check logs)',
    };
  } catch (error) {
    console.error('Error in sendOTP:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send OTP',
    };
  }
};

// Verify OTP
export const verifyOTP = (phoneNumber: string, otp: string): { success: boolean; message: string } => {
  // Check if OTP exists for this phone number
  if (!otpStore[phoneNumber]) {
    return {
      success: false,
      message: 'No OTP was sent to this number or OTP has expired',
    };
  }

  const storedOTP = otpStore[phoneNumber];

  // Check if OTP has expired
  if (Date.now() > storedOTP.expiry) {
    // Remove expired OTP
    delete otpStore[phoneNumber];
    return {
      success: false,
      message: 'OTP has expired. Please request a new one',
    };
  }

  // Verify OTP
  if (storedOTP.otp === otp) {
    // OTP verified, remove it from store
    delete otpStore[phoneNumber];
    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  return {
    success: false,
    message: 'Invalid OTP. Please try again',
  };
};

// Clean up expired OTPs (can be called periodically)
export const cleanupExpiredOTPs = (): void => {
  const now = Date.now();
  Object.keys(otpStore).forEach(phoneNumber => {
    if (now > otpStore[phoneNumber].expiry) {
      delete otpStore[phoneNumber];
    }
  });
}; 