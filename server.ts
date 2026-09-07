import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Body parsers with generous limits for screenshot uploads
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Lazy/Safe GoogleGenAI instance setup
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not configured in environment.');
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory data store for persistent user history and sessions
interface StoredAnalysis {
  id: string;
  userId: string;
  inputType: 'text' | 'image' | 'comparison';
  inputText?: string;
  imageUrl?: string;
  imageName?: string;
  category?: string;
  riskScore: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  summary: string;
  indicators: Array<{
    id: string;
    name: string;
    description: string;
    severity: 'Low' | 'Medium' | 'High';
    category?: string;
  }>;
  recommendedActions: string[];
  confidenceNotes: string;
  extractedDetails?: {
    sender?: string;
    claimedCompany?: string;
    salaryOffered?: string;
    paymentRequested?: string;
    channelUsed?: string;
    urgencyLevel?: 'Low' | 'Medium' | 'High' | 'Extreme';
    interviewMethod?: string;
  };
  createdAt: string;
  isSaved?: boolean;
}

// Seed initial realistic analyses for instant rich dashboard and demo
const analysisDatabase: StoredAnalysis[] = [
  {
    id: 'demo-analysis-1',
    userId: 'guest_user',
    inputType: 'text',
    inputText: `Dear Applicant,\nWe reviewed your resume on LinkedIn and are pleased to offer you the Remote Data Entry / Operations Assistant position at Apex Global Logix.\n\nSalary: $65/hour ($5,200 bi-weekly)\nHours: 15-20 hours/week, flexible schedule.\n\nTo begin onboarding immediately, please message our hiring manager Dr. Arthur Morgan on Telegram (@ApexHiring_HR) with reference code #APX-992. You will be sent a check of $2,450 to purchase specialized home-office hardware and encrypted software from our approved vendor.\n\nPlease reply with your full legal name, home address, bank account number, and SSN for payroll processing.\n\nRegards,\nApex HR Team`,
    category: 'job_offer',
    riskScore: 92,
    riskLevel: 'Critical',
    summary: 'This message exhibits multiple classic indicators of a fraudulent employment scam, including an unsolicited high hourly rate for an entry-level position, migration to Telegram, fake check equipment advance scheme, and premature requests for sensitive banking and identity data.',
    indicators: [
      {
        id: 'ind-1',
        name: 'Upfront Equipment Check & Approved Vendor Scheme',
        description: 'The sender promises to send a check to purchase equipment from an "approved vendor". This is a textbook fake check scam where the check bounces after the victim wires funds to the fake vendor.',
        severity: 'High',
        category: 'financial'
      },
      {
        id: 'ind-2',
        name: 'Off-Platform Communication (Telegram)',
        description: 'Directing candidates away from legitimate corporate channels or email to unverified messaging apps like Telegram to evade fraud detection and maintain anonymity.',
        severity: 'High',
        category: 'communication'
      },
      {
        id: 'ind-3',
        name: 'Premature Request for SSN & Banking Information',
        description: 'Requesting bank account details and Social Security numbers prior to formal interviews, formal verified contracts, or secure HR portal access.',
        severity: 'High',
        category: 'identity'
      },
      {
        id: 'ind-4',
        name: 'Disproportionate Salary vs. Entry-Level Role',
        description: 'Offering $65/hour ($135,000+ annualized equivalent) for a remote part-time data entry role with minimal qualification checks.',
        severity: 'Medium',
        category: 'behavioral'
      }
    ],
    recommendedActions: [
      'Do not send any personal, financial, or banking details.',
      'Never accept or deposit a check requiring you to wire or forward money to a third-party vendor.',
      'Refuse communication via Telegram or personal messaging channels.',
      'Independently look up the company and contact their official HR team through verified domain channels.'
    ],
    confidenceNotes: 'High certainty based on pattern matching with FTC and FBI IC3 recruitment scam advisories. However, this is an AI-generated risk assessment and not a judicial finding.',
    extractedDetails: {
      sender: 'Apex HR Team',
      claimedCompany: 'Apex Global Logix',
      salaryOffered: '$65/hour ($5,200 bi-weekly)',
      paymentRequested: '$2,450 vendor advance check',
      channelUsed: 'Telegram (@ApexHiring_HR)',
      urgencyLevel: 'High',
      interviewMethod: 'None / Instant Telegram Chat'
    },
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    isSaved: true
  },
  {
    id: 'demo-analysis-2',
    userId: 'guest_user',
    inputType: 'text',
    inputText: `Hi Sarah, congratulations! You have been selected for the Marketing Specialist position at Stripe. We noticed your portfolio and would like to offer you the role. Please purchase your security pass by paying $150 via Apple Gift Card / Zelle to our HR coordinator so your access badge can be printed. Reply within 2 hours or your spot will be given to another applicant.`,
    category: 'recruitment_email',
    riskScore: 96,
    riskLevel: 'Critical',
    summary: 'Critical risk: Impersonates a well-known tech brand (Stripe), demands immediate upfront payments via non-refundable methods (Gift Cards / Zelle), and creates extreme artificial urgency.',
    indicators: [
      {
        id: 'ind-21',
        name: 'Upfront Payment via Gift Cards / Zelle',
        description: 'Legitimate employers never demand job applicants pay for security badges, onboarding materials, or background checks using Gift Cards, Crypto, or P2P transfer apps.',
        severity: 'High',
        category: 'financial'
      },
      {
        id: 'ind-22',
        name: 'Extreme Artificial Urgency',
        description: '2-hour deadline designed to induce panic and prevent independent due diligence.',
        severity: 'High',
        category: 'behavioral'
      },
      {
        id: 'ind-23',
        name: 'Impersonation of Established Enterprise',
        description: 'Using the Stripe brand name without a verified corporate email domain or formal interview process.',
        severity: 'High',
        category: 'credential'
      }
    ],
    recommendedActions: [
      'Cease all contact immediately. Do not transfer funds or purchase gift cards.',
      'Report the phishing message to the official security team of the impersonated brand.',
      'Block the sender address/phone number.'
    ],
    confidenceNotes: 'Unambiguous scam indicators present. AI-generated risk assessment; confirm via official brand career portals.',
    extractedDetails: {
      sender: 'HR coordinator',
      claimedCompany: 'Stripe (Impersonated)',
      salaryOffered: 'Marketing Specialist',
      paymentRequested: '$150 via Apple Gift Card / Zelle',
      channelUsed: 'SMS / Direct Message',
      urgencyLevel: 'Extreme',
      interviewMethod: 'No formal interview'
    },
    createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    isSaved: true
  },
  {
    id: 'demo-analysis-3',
    userId: 'guest_user',
    inputType: 'text',
    inputText: `Hello David,\n\nThank you for taking the time to interview with our engineering panel last Thursday. We are pleased to extend a formal offer for the Senior Frontend Engineer role at Vercel Inc.\n\nPlease find the official offer letter attached in PDF format along with the comprehensive benefits overview. You may review the terms and sign electronically via our DocuSign integration within 5 business days.\n\nIf you have any questions regarding equity grant details or healthcare coverage, feel free to schedule a follow-up call with me via my calendar link (vercel.com/team/recruiter).\n\nBest regards,\nElena Rostova\nSenior Technical Recruiter | Vercel\nelena.rostova@vercel.com`,
    category: 'job_offer',
    riskScore: 8,
    riskLevel: 'Low',
    summary: 'The message demonstrates standard, professional hiring practices: refers to a prior multi-stage interview, uses an authentic corporate domain (@vercel.com), provides standard 5-day consideration period, uses DocuSign, and requests no upfront funds or sensitive banking info in plain text.',
    indicators: [
      {
        id: 'ind-31',
        name: 'Official Corporate Domain Verified',
        description: 'Sender utilizes verified @vercel.com domain corresponding directly to the official organization.',
        severity: 'Low',
        category: 'credential'
      },
      {
        id: 'ind-32',
        name: 'Standard Consideration Window',
        description: '5 business days allowed with no pressure tactics or artificial countdowns.',
        severity: 'Low',
        category: 'behavioral'
      },
      {
        id: 'ind-33',
        name: 'No Upfront Financial Demands',
        description: 'Zero requests for money, gift cards, software purchases, or direct wire transfers.',
        severity: 'Low',
        category: 'financial'
      }
    ],
    recommendedActions: [
      'Verify that the email headers originated from @vercel.com mail servers.',
      'Sign only via the official DocuSign link after thorough contract review.',
      'Maintain standard caution regarding any subsequent requests.'
    ],
    confidenceNotes: 'Patterns match legitimate corporate recruiting correspondence. Independent verification remains recommended before signing legal agreements.',
    extractedDetails: {
      sender: 'Elena Rostova (Senior Technical Recruiter)',
      claimedCompany: 'Vercel Inc.',
      salaryOffered: 'Senior Frontend Engineer',
      paymentRequested: 'None ($0)',
      channelUsed: 'Official Corporate Email (@vercel.com)',
      urgencyLevel: 'Low',
      interviewMethod: 'Engineering Panel Interview Completed'
    },
    createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    isSaved: false
  }
];

// Helper: Rule-based fallback evaluator when AI is in offline/fallback mode
function generateRuleBasedAssessment(text: string, isImage: boolean = false): any {
  const lower = (text || '').toLowerCase();
  const indicators: any[] = [];
  let score = 15; // baseline

  // Upfront Payment
  if (lower.includes('gift card') || lower.includes('zelle') || lower.includes('crypto') || lower.includes('wire transfer') || lower.includes('pay $') || lower.includes('fee') || lower.includes('purchase equipment') || lower.includes('security deposit')) {
    score += 35;
    indicators.push({
      id: `ind-${Date.now()}-1`,
      name: 'Upfront Payment or Purchase Request',
      description: 'The offer mentions upfront payments, security fees, gift cards, or buying equipment using personal funds before employment.',
      severity: 'High',
      category: 'financial'
    });
  }

  // Telegram / WhatsApp / Signal migration
  if (lower.includes('telegram') || lower.includes('@telegram') || lower.includes('whatsapp') || lower.includes('signal') || lower.includes('skype id') || lower.includes('text me on')) {
    score += 20;
    indicators.push({
      id: `ind-${Date.now()}-2`,
      name: 'Off-Platform Messaging Channels',
      description: 'Communication is being directed to encrypted personal messaging apps (Telegram, WhatsApp, Signal) rather than official company portals.',
      severity: 'High',
      category: 'communication'
    });
  }

  // Free/Generic Email Domain
  if (lower.includes('@gmail.com') || lower.includes('@yahoo.com') || lower.includes('@hotmail.com') || lower.includes('@outlook.com') || lower.includes('consultant-hr') || lower.includes('careers-job')) {
    score += 20;
    indicators.push({
      id: `ind-${Date.now()}-3`,
      name: 'Unverified / Public Email Domain',
      description: 'The recruiter is using a free public email provider (@gmail/@yahoo) or an unverified lookalike domain rather than the official company domain.',
      severity: 'High',
      category: 'credential'
    });
  }

  // High Unrealistic Salary / Fast Hiring
  if (lower.includes('$50/hr') || lower.includes('$60/hr') || lower.includes('$70/hr') || lower.includes('$80/hr') || lower.includes('$100/hr') || lower.includes('$5000/week') || lower.includes('no experience required') || lower.includes('instant hire') || lower.includes('hired immediately')) {
    score += 15;
    indicators.push({
      id: `ind-${Date.now()}-4`,
      name: 'Unrealistic Compensation vs. Low Barrier to Entry',
      description: 'The salary or hourly rate is significantly higher than industry averages for low-experience or basic entry tasks.',
      severity: 'Medium',
      category: 'behavioral'
    });
  }

  // Urgent Pressure
  if (lower.includes('urgent') || lower.includes('immediately') || lower.includes('within 24 hours') || lower.includes('within 2 hours') || lower.includes('limited spots') || lower.includes('act fast') || lower.includes('kindly reply')) {
    score += 10;
    indicators.push({
      id: `ind-${Date.now()}-5`,
      name: 'High Urgency & Pressure Tactics',
      description: 'The sender uses psychological urgency to force rapid decisions without adequate time for candidate due diligence.',
      severity: 'Medium',
      category: 'behavioral'
    });
  }

  // Sensitive PII
  if (lower.includes('ssn') || lower.includes('social security') || lower.includes('bank details') || lower.includes('routing number') || lower.includes('otp') || lower.includes('passport copy') || lower.includes('id photo')) {
    score += 20;
    indicators.push({
      id: `ind-${Date.now()}-6`,
      name: 'Premature Request for Sensitive Personal Data (PII)',
      description: 'Requests for bank account numbers, SSN, passport, or identity documents before a formal, verified contract is signed.',
      severity: 'High',
      category: 'identity'
    });
  }

  if (indicators.length === 0) {
    indicators.push({
      id: `ind-${Date.now()}-ok`,
      name: 'Standard Recruitment Tone',
      description: 'No explicit extortion or common scam keywords found in the provided sample.',
      severity: 'Low',
      category: 'general'
    });
  }

  score = Math.min(Math.max(score, 5), 98);

  let riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical' = 'Low';
  if (score > 75) riskLevel = 'Critical';
  else if (score > 50) riskLevel = 'High';
  else if (score > 25) riskLevel = 'Moderate';

  return {
    risk_score: score,
    risk_level: riskLevel,
    summary: score > 50 
      ? `This message contains ${indicators.length} signals commonly associated with fraudulent recruitment and communication schemes. We advise exercising severe caution and conducting independent verification.`
      : `The analyzed message exhibits relatively standard communication traits, though routine security vigilance is always recommended before sharing private data.`,
    indicators,
    recommended_actions: [
      'Do not send money, wire transfers, or gift card codes before independently verifying the employer.',
      'Never share bank account numbers, SSNs, or OTP verification codes over unencrypted chat.',
      'Look up the official company website and reach out to their listed HR department directly.',
      'Check whether the sender domain matches the registered corporate URL.'
    ],
    confidence_notes: 'Automated heuristics-based estimation. This assessment does not constitute legal or definitive proof.',
    extracted_details: {
      sender: 'Detected Sender',
      claimedCompany: 'Analyzed Organization',
      salaryOffered: 'Refer to message body',
      paymentRequested: score > 50 ? 'Potential upfront request detected' : 'None detected',
      channelUsed: isImage ? 'Screenshot Upload' : 'Text Input',
      urgencyLevel: score > 60 ? 'High' : 'Moderate',
      interviewMethod: 'Analysis completed'
    }
  };
}

// ----------------------------------------------------------------------
// API ROUTES
// ----------------------------------------------------------------------

// 1. Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'ScamShield AI',
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY)
  });
});

// 2. Scam Analysis Endpoint (Text & Image Screenshot)
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const { inputType, text, imageBase64, mimeType, imageName, category } = req.body;

    if (!text && !imageBase64) {
      res.status(400).json({ error: 'Please provide either text content or a screenshot image.' });
      return;
    }

    const ai = getGeminiClient();

    let analysisResult: any = null;

    if (ai) {
      try {
        const systemPrompt = `You are ScamShield AI, an elite cybersecurity and fraud prevention analyst specializing in detecting fake job offers, recruitment scams, phishing emails, SMS/WhatsApp scams, and identity theft traps.
Analyze the provided user input (text and/or screenshot) with extreme forensic precision.

Evaluate the following suspicious scam indicators:
1. Requests for upfront payment, equipment fees, training fees, background check fees, or gift cards / crypto / Zelle.
2. Requests for bank details, routing numbers, passwords, OTPs, or premature SSN / identity documents.
3. Unrealistic salary promises compared to entry-level requirements (e.g., $60/hr for data entry).
4. Urgent pressure tactics, 24-hr countdowns, or emotional intimidation.
5. Generic greetings ("Dear Candidate", "Dear Beloved"), poor grammar combined with impersonation of elite brands.
6. Suspicious links, lookalike domains (e.g., @company-careers-hr.com instead of @company.com), or free email domains (@gmail.com for executive recruiters).
7. Requests to migrate off official platforms to Telegram, WhatsApp, Signal, or personal chat.
8. Fake check / equipment purchasing schemes where the victim is promised a check to pay a third-party vendor.
9. Suspicious hiring velocity: instant hiring without technical interviews, portfolio checks, or video calls.

IMPORTANT INSTRUCTION:
Do not automatically label something as a scam based on only one indicator. Evaluate multiple signals and calibrate risk score accurately (0-100):
- Low Risk (0-25): Legitimate-looking corporate correspondence, verified domain patterns, standard hiring steps.
- Moderate Risk (26-50): Ambiguous, minor irregularities or informal tone, but no overt fraud signals.
- High Risk (51-75): Strong suspicious patterns, off-platform migration, unverified domain, or exaggerated offers.
- Critical Risk (76-100): Clear scam hallmarks (upfront payment, fake check, Telegram recruitment, gift cards, immediate SSN/bank requests).

Return ONLY valid JSON matching this schema:
{
  "risk_score": number (0 to 100),
  "risk_level": "Low" | "Moderate" | "High" | "Critical",
  "summary": "Concise, professional assessment of the suspicious patterns found.",
  "indicators": [
    {
      "name": "Indicator title",
      "description": "Specific reason why this pattern in the text is risky",
      "severity": "Low" | "Medium" | "High",
      "category": "financial" | "identity" | "communication" | "credential" | "behavioral" | "general"
    }
  ],
  "recommended_actions": [
    "Clear actionable step 1",
    "Clear actionable step 2"
  ],
  "confidence_notes": "Explanation of AI confidence and verification limitations.",
  "extracted_details": {
    "sender": "Sender name or title",
    "claimedCompany": "Company name if identified",
    "salaryOffered": "Compensation mentioned",
    "paymentRequested": "Any money/fee requested or 'None'",
    "channelUsed": "Email / WhatsApp / Telegram / SMS / etc.",
    "urgencyLevel": "Low" | "Medium" | "High" | "Extreme",
    "interviewMethod": "Interview details or 'None mentioned'"
  }
}`;

        const contents: any[] = [];

        if (imageBase64) {
          // Clean base64 string if data URL prefix is attached
          const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
          contents.push({
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'image/png'
            }
          });
        }

        const promptText = `Analyze this ${category || 'message / job offer'}:\n\n${text || 'Please inspect the attached screenshot for scam indicators, contact information, domain names, payment requests, and suspicious language.'}`;
        contents.push({ text: promptText });

        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: contents.length === 1 && !imageBase64 ? promptText : { parts: contents },
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            temperature: 0.2,
          }
        });

        const rawText = response.text?.trim() || '{}';
        analysisResult = JSON.parse(rawText);
      } catch (genAiError) {
        console.error('Gemini API Error, falling back to heuristic engine:', genAiError);
        analysisResult = generateRuleBasedAssessment(text || '', Boolean(imageBase64));
      }
    } else {
      // Fallback rule engine when no API key is provided
      analysisResult = generateRuleBasedAssessment(text || '', Boolean(imageBase64));
    }

    // Ensure format normalization
    const safeIndicators = (analysisResult.indicators || []).map((ind: any, index: number) => ({
      id: ind.id || `ind-${Date.now()}-${index}`,
      name: ind.name || 'Suspicious Pattern',
      description: ind.description || 'Pattern flagged during security scan.',
      severity: ind.severity || 'Medium',
      category: ind.category || 'general'
    }));

    const safeScore = typeof analysisResult.risk_score === 'number' 
      ? Math.min(Math.max(analysisResult.risk_score, 0), 100) 
      : 50;

    let safeLevel = analysisResult.risk_level;
    if (!['Low', 'Moderate', 'High', 'Critical'].includes(safeLevel)) {
      if (safeScore > 75) safeLevel = 'Critical';
      else if (safeScore > 50) safeLevel = 'High';
      else if (safeScore > 25) safeLevel = 'Moderate';
      else safeLevel = 'Low';
    }

    const newAnalysis: StoredAnalysis = {
      id: `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: req.body.userId || 'guest_user',
      inputType: inputType || (imageBase64 ? 'image' : 'text'),
      inputText: text,
      imageUrl: imageBase64 ? (imageBase64.length > 50000 ? imageBase64.substring(0, 100) + '...[truncated]' : imageBase64) : undefined,
      imageName: imageName || (imageBase64 ? 'screenshot.png' : undefined),
      category: category || 'general',
      riskScore: safeScore,
      riskLevel: safeLevel,
      summary: analysisResult.summary || 'Security analysis complete.',
      indicators: safeIndicators,
      recommendedActions: Array.isArray(analysisResult.recommended_actions) ? analysisResult.recommended_actions : [
        'Do not send money or banking information before independent company verification.',
        'Verify the recruiter via official company domain email.',
        'Never accept checks requiring you to wire money back.'
      ],
      confidenceNotes: analysisResult.confidence_notes || 'AI-generated risk assessment based on pattern heuristics. Not definitive proof of fraud.',
      extractedDetails: analysisResult.extracted_details || {
        sender: 'Unknown',
        claimedCompany: 'Not Specified',
        salaryOffered: 'Not Disclosed',
        paymentRequested: 'None',
        channelUsed: 'Digital Message',
        urgencyLevel: 'Moderate',
        interviewMethod: 'Unverified'
      },
      createdAt: new Date().toISOString(),
      isSaved: false
    };

    // Store in memory database
    analysisDatabase.unshift(newAnalysis);

    res.json({
      success: true,
      analysis: newAnalysis
    });
  } catch (error: any) {
    console.error('Analysis endpoint failure:', error);
    res.status(500).json({ error: error.message || 'Internal server error during analysis.' });
  }
});

// 3. Company Verification Endpoint
app.post('/api/verify-company', async (req: Request, res: Response) => {
  try {
    const { companyName, website, recruiterEmail, jobPostingUrl } = req.body;

    if (!companyName && !website && !recruiterEmail) {
      res.status(400).json({ error: 'Please provide at least a Company Name, Website, or Recruiter Email.' });
      return;
    }

    const ai = getGeminiClient();
    let result: any = null;

    if (ai) {
      try {
        const prompt = `Perform a structured company verification assessment for:
Company Name: "${companyName || 'Not specified'}"
Official Website: "${website || 'Not specified'}"
Recruiter Email: "${recruiterEmail || 'Not specified'}"
Job Posting URL: "${jobPostingUrl || 'Not specified'}"

Analyze:
1. Domain Match: Does recruiterEmail domain match website domain? Is the email on a free public domain (gmail, yahoo) or lookalike domain?
2. Website Authenticity Check: Are website signals consistent with a real business?
3. Careers Page & Job Posting Check: Is the job posting on an official career portal or suspicious third-party redirect?
4. Contact & Social Footprint: Standard verification recommendations.

RULES FOR LANGUAGE:
Do NOT make definitive claims or illegal accusations like "This company is definitely a criminal enterprise".
Use measured, professional cybersecurity language:
- "Information appears consistent"
- "Additional verification recommended"
- "Unable to verify"
- "High risk flags detected"

Return JSON in this format:
{
  "trustScore": number (0 to 100),
  "overallStatus": "Information appears consistent" | "Additional verification recommended" | "Unable to verify" | "High risk flags detected",
  "summary": "Concise summary of findings.",
  "checklist": [
    {
      "id": "domain_check",
      "title": "Email Domain Consistency",
      "status": "pass" | "warning" | "fail" | "inconclusive",
      "details": "Explanation of domain evaluation",
      "recommendation": "What the user should verify"
    },
    {
      "id": "website_check",
      "title": "Official Website Verification",
      "status": "pass" | "warning" | "fail" | "inconclusive",
      "details": "Explanation of website evaluation",
      "recommendation": "What the user should verify"
    },
    {
      "id": "careers_check",
      "title": "Careers Page Cross-Reference",
      "status": "pass" | "warning" | "fail" | "inconclusive",
      "details": "Explanation of careers portal alignment",
      "recommendation": "What the user should verify"
    },
    {
      "id": "contact_check",
      "title": "Independent Contact Verification",
      "status": "pass" | "warning" | "fail" | "inconclusive",
      "details": "Explanation of reachable contact channels",
      "recommendation": "What the user should verify"
    },
    {
      "id": "social_check",
      "title": "Corporate Footprint & Presence",
      "status": "pass" | "warning" | "fail" | "inconclusive",
      "details": "Explanation of public corporate footprint",
      "recommendation": "What the user should verify"
    }
  ],
  "findings": ["Point 1", "Point 2", "Point 3"],
  "recommendedSteps": ["Step 1", "Step 2", "Step 3"]
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        result = JSON.parse(response.text?.trim() || '{}');
      } catch (err) {
        console.error('Company verification Gemini error:', err);
      }
    }

    // Heuristic fallback if AI failed or is offline
    if (!result || !result.checklist) {
      let emailMismatch = false;
      const isFreeEmail = recruiterEmail && (recruiterEmail.includes('@gmail.com') || recruiterEmail.includes('@yahoo.com') || recruiterEmail.includes('@hotmail.com') || recruiterEmail.includes('@outlook.com'));
      
      if (website && recruiterEmail && !isFreeEmail) {
        const domainClean = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
        const emailDomain = recruiterEmail.split('@')[1]?.toLowerCase();
        if (domainClean && emailDomain && !emailDomain.includes(domainClean) && !domainClean.includes(emailDomain)) {
          emailMismatch = true;
        }
      }

      let trust = 65;
      let status: 'Information appears consistent' | 'Additional verification recommended' | 'Unable to verify' | 'High risk flags detected' = 'Additional verification recommended';

      if (isFreeEmail) {
        trust = 30;
        status = 'High risk flags detected';
      } else if (emailMismatch) {
        trust = 38;
        status = 'High risk flags detected';
      } else if (website && !recruiterEmail) {
        trust = 55;
        status = 'Additional verification recommended';
      } else if (website && recruiterEmail && !emailMismatch && !isFreeEmail) {
        trust = 85;
        status = 'Information appears consistent';
      }

      result = {
        trustScore: trust,
        overallStatus: status,
        summary: isFreeEmail 
          ? 'Recruiter is using a free public email address, which is unusual for authentic corporate hiring.'
          : (emailMismatch ? 'The recruiter email domain does not match the provided company website domain.' : 'Verification data cross-referenced with domain standards.'),
        checklist: [
          {
            id: 'domain_check',
            title: 'Email Domain Consistency',
            status: isFreeEmail ? 'fail' : (emailMismatch ? 'warning' : 'pass'),
            details: isFreeEmail 
              ? `Email uses public provider (${recruiterEmail}). Legitimate companies use custom corporate domains.` 
              : (emailMismatch ? `Email domain does not match ${website}.` : `Domain matches corporate structure.`),
            recommendation: 'Request confirmation through official corporate directory.'
          },
          {
            id: 'website_check',
            title: 'Official Website Structure',
            status: website ? 'pass' : 'inconclusive',
            details: website ? `Website address provided (${website}).` : 'No official website provided for verification.',
            recommendation: 'Check WHOIS registration age and security certificate.'
          },
          {
            id: 'careers_check',
            title: 'Careers Page Cross-Reference',
            status: jobPostingUrl ? 'pass' : 'warning',
            details: jobPostingUrl ? 'Job posting URL provided for analysis.' : 'Job listing not directly verified on official careers portal.',
            recommendation: 'Search for the specific Job ID directly on the company career portal.'
          },
          {
            id: 'contact_check',
            title: 'Independent Contact Verification',
            status: 'warning',
            details: 'Always locate switchboard or HR contact information independently via Google Search or LinkedIn.',
            recommendation: 'Do not use phone numbers supplied exclusively in the suspicious message.'
          },
          {
            id: 'social_check',
            title: 'Corporate Footprint & Presence',
            status: companyName ? 'pass' : 'inconclusive',
            details: `Cross-check ${companyName || 'the organization'} on LinkedIn Company Directory and Glassdoor.`,
            recommendation: 'Verify recruiter profile tenure and employee connections.'
          }
        ],
        findings: [
          isFreeEmail ? 'Free email provider detected (@gmail/@yahoo)' : 'Corporate email domain formatting inspected',
          'Cross-reference of hiring channels and official presence'
        ],
        recommendedSteps: [
          'Search for the company on LinkedIn and verify the recruiter is actively employed there.',
          'Visit the company website directly (not via links in the email) and navigate to their Careers page.',
          'Call the main company phone number found independently to confirm the job opening.'
        ]
      };
    }

    res.json({
      success: true,
      verification: {
        id: `verif-${Date.now()}`,
        companyName: companyName || 'Company Verification',
        website: website || '',
        recruiterEmail: recruiterEmail || '',
        jobPostingUrl: jobPostingUrl || '',
        ...result,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Company verification error:', error);
    res.status(500).json({ error: error.message || 'Error executing company verification.' });
  }
});

// 4. Comparison Endpoint (Side-by-side analysis)
app.post('/api/compare', async (req: Request, res: Response) => {
  try {
    const { messageA, messageB, titleA, titleB } = req.body;

    if (!messageA || !messageB) {
      res.status(400).json({ error: 'Please provide both Message A and Message B to compare.' });
      return;
    }

    const ai = getGeminiClient();
    let comparisonData: any = null;

    if (ai) {
      try {
        const prompt = `Compare these two job offers/messages for scam and security risk:

OFFER A ("${titleA || 'Message A'}"):
${messageA}

OFFER B ("${titleB || 'Message B'}"):
${messageB}

Analyze each message individually and compare their key differences, risk profiles, and safety determination.
Return JSON in this format:
{
  "analysisA": {
    "risk_score": number (0-100),
    "risk_level": "Low" | "Moderate" | "High" | "Critical",
    "summary": "Summary of A",
    "indicators": [{"name": "Indicator", "description": "Why", "severity": "Low"|"Medium"|"High"}]
  },
  "analysisB": {
    "risk_score": number (0-100),
    "risk_level": "Low" | "Moderate" | "High" | "Critical",
    "summary": "Summary of B",
    "indicators": [{"name": "Indicator", "description": "Why", "severity": "Low"|"Medium"|"High"}]
  },
  "comparisonVerdict": "Detailed side-by-side comparison verdict explaining which offer is safer and why.",
  "keyDifferences": [
    "Difference 1: e.g. Domain authenticity",
    "Difference 2: e.g. Payment requests",
    "Difference 3: e.g. Interview process"
  ],
  "saferOption": "A" | "B" | "Both Suspicious" | "Both Appear Low Risk"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        });

        comparisonData = JSON.parse(response.text?.trim() || '{}');
      } catch (err) {
        console.error('Comparison error with Gemini:', err);
      }
    }

    if (!comparisonData || !comparisonData.analysisA) {
      const evalA = generateRuleBasedAssessment(messageA);
      const evalB = generateRuleBasedAssessment(messageB);

      let safer: 'A' | 'B' | 'Both Suspicious' | 'Both Appear Low Risk' = 'Both Suspicious';
      if (evalA.risk_score < evalB.risk_score && evalA.risk_score < 40) safer = 'A';
      else if (evalB.risk_score < evalA.risk_score && evalB.risk_score < 40) safer = 'B';
      else if (evalA.risk_score < 30 && evalB.risk_score < 30) safer = 'Both Appear Low Risk';

      comparisonData = {
        analysisA: evalA,
        analysisB: evalB,
        comparisonVerdict: `Offer A received a risk score of ${evalA.risk_score}/100, while Offer B received a risk score of ${evalB.risk_score}/100. ${safer === 'A' ? 'Offer A exhibits significantly fewer red flags.' : (safer === 'B' ? 'Offer B appears more consistent with legitimate communication.' : 'Both offers exhibit patterns warranting extreme caution.')}`,
        keyDifferences: [
          `Risk Score differential: ${Math.abs(evalA.risk_score - evalB.risk_score)} points`,
          `Number of suspicious indicators in A (${evalA.indicators.length}) vs B (${evalB.indicators.length})`,
          'Communication channel security comparison'
        ],
        saferOption: safer
      };
    }

    res.json({
      success: true,
      comparison: {
        id: `comp-${Date.now()}`,
        itemA: {
          title: titleA || 'Offer A',
          text: messageA,
          analysis: comparisonData.analysisA
        },
        itemB: {
          title: titleB || 'Offer B',
          text: messageB,
          analysis: comparisonData.analysisB
        },
        comparisonVerdict: comparisonData.comparisonVerdict,
        keyDifferences: comparisonData.keyDifferences || [],
        saferOption: comparisonData.saferOption || 'Both Suspicious',
        createdAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: error.message || 'Error generating comparison report.' });
  }
});

// 5. Get Analyses History & Stats
app.get('/api/analyses', (req: Request, res: Response) => {
  const { riskLevel, category, limit } = req.query;
  let results = [...analysisDatabase];

  if (riskLevel && typeof riskLevel === 'string') {
    results = results.filter(a => a.riskLevel.toLowerCase() === riskLevel.toLowerCase());
  }

  if (category && typeof category === 'string') {
    results = results.filter(a => a.category?.toLowerCase() === category.toLowerCase());
  }

  const parsedLimit = limit ? parseInt(limit as string, 10) : 50;
  const sliced = results.slice(0, parsedLimit);

  // Compute statistics
  const total = analysisDatabase.length;
  const criticalCount = analysisDatabase.filter(a => a.riskLevel === 'Critical').length;
  const highCount = analysisDatabase.filter(a => a.riskLevel === 'High').length;
  const moderateCount = analysisDatabase.filter(a => a.riskLevel === 'Moderate').length;
  const lowCount = analysisDatabase.filter(a => a.riskLevel === 'Low').length;
  const avgScore = total > 0 ? Math.round(analysisDatabase.reduce((acc, curr) => acc + curr.riskScore, 0) / total) : 0;

  res.json({
    analyses: sliced,
    stats: {
      total,
      avgScore,
      distribution: {
        critical: criticalCount,
        high: highCount,
        moderate: moderateCount,
        low: lowCount
      }
    }
  });
});

// 6. Delete Analysis
app.delete('/api/analyses/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = analysisDatabase.findIndex(a => a.id === id);
  if (index !== -1) {
    analysisDatabase.splice(index, 1);
    res.json({ success: true, message: 'Analysis deleted successfully.' });
  } else {
    res.status(404).json({ error: 'Analysis record not found.' });
  }
});

// 7. Clear All Analyses History
app.delete('/api/analyses', (req: Request, res: Response) => {
  analysisDatabase.length = 0;
  res.json({ success: true, message: 'All analysis history cleared.' });
});

// 8. Toggle Save Report
app.patch('/api/analyses/:id/save', (req: Request, res: Response) => {
  const { id } = req.params;
  const record = analysisDatabase.find(a => a.id === id);
  if (record) {
    record.isSaved = !record.isSaved;
    res.json({ success: true, isSaved: record.isSaved });
  } else {
    res.status(404).json({ error: 'Analysis record not found.' });
  }
});

// ----------------------------------------------------------------------
// VITE DEV / PRODUCTION MIDDLEWARE
// ----------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ScamShield AI] Server running on http://localhost:${PORT}`);
  });
}

startServer();
