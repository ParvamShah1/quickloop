// AWS SNS Service for React Native
import { Buffer } from 'buffer';
import * as crypto from 'crypto-browserify';


const AWS_REGION = process.env.AWS_REGION; // Replace with your AWS region
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID; // Replace with your access key
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY; // Replace with your secret key

// AWS SNS API endpoint
const SNS_ENDPOINT = `https://sns.${AWS_REGION}.amazonaws.com`;

/**
 * Sign AWS API request
 * This is a simplified version of AWS Signature V4
 */
function signRequest(method: string, url: string, body: string, date: Date): string {
  const dateString = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = dateString.substring(0, 8);
  
  // Create canonical request
  const canonicalRequest = [
    method,
    url,
    '', // Query string
    'host:' + SNS_ENDPOINT.replace('https://', ''),
    'x-amz-date:' + dateString,
    '',
    'host;x-amz-date',
    crypto.createHash('sha256').update(body).digest('hex')
  ].join('\n');
  
  // Create string to sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateString,
    `${dateStamp}/${AWS_REGION}/sns/aws4_request`,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');
  
  // Calculate signature
  const kDate = crypto.createHmac('sha256', 'AWS4' + AWS_SECRET_ACCESS_KEY).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(AWS_REGION).digest();
  const kService = crypto.createHmac('sha256', kRegion).update('sns').digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  
  // Create authorization header
  return `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${dateStamp}/${AWS_REGION}/sns/aws4_request, SignedHeaders=host;x-amz-date, Signature=${signature}`;
}

/**
 * Send SMS using AWS SNS
 */
export async function sendSMS(phoneNumber: string, message: string): Promise<boolean> {
  try {
    // Check if we have valid AWS credentials
    if (AWS_ACCESS_KEY_ID.includes('YOUR_') || 
        AWS_SECRET_ACCESS_KEY.includes('YOUR_')) {
      console.log('[AWS SNS] Using development mode (no SMS sent)');
      return true; // Simulate success in development mode
    }
    
    const date = new Date();
    const dateString = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    
    // Prepare request body
    const params = new URLSearchParams();
    params.append('Action', 'Publish');
    params.append('Version', '2010-03-31');
    params.append('PhoneNumber', phoneNumber);
    params.append('Message', message);
    
    const body = params.toString();
    
    // Sign request
    const authorization = signRequest('POST', '/', body, date);
    
    // Send request
    const response = await fetch(SNS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Amz-Date': dateString,
        'Authorization': authorization,
      },
      body,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AWS SNS] Error: ${response.status} ${response.statusText}`, errorText);
      return false;
    }
    
    const responseText = await response.text();
    console.log('[AWS SNS] Success:', responseText);
    return true;
  } catch (error) {
    console.error('[AWS SNS] Error sending SMS:', error);
    return false;
  }
} 