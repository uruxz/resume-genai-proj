const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {
    try {
        const prompt = `You are an expert technical interview coach. Analyze this candidate and generate a comprehensive, detailed interview preparation report.

CANDIDATE INFORMATION:
Resume: 
${resume}

Self Description: 
${selfDescription}

TARGET JOB DESCRIPTION:
${jobDescription}

TASK: Generate a detailed interview preparation report. You MUST include:

1. Match Score (0-100): How well does the candidate match this job?

2. Technical Questions (MINIMUM 7 questions): Generate specific, technical questions relevant to this job. Each should test specific skills mentioned in the job description.

3. Behavioral Questions (MINIMUM 5 questions): Generate questions to assess soft skills, leadership, teamwork, problem-solving approach.

4. Skill Gaps (MINIMUM 5 skills): Identify specific skills the candidate needs to develop, with severity (low/medium/high) based on job requirements.

5. Preparation Plan (7-10 days): Create a day-by-day preparation roadmap with specific focus areas and actionable tasks.

RESPONSE: Generate VALID JSON ONLY (no markdown, no extra text):
{
  "matchScore": <number 0-100>,
  "title": "<job title from the job description>",
  "technicalQuestions": [
    {
      "question": "<specific technical question>",
      "intention": "<explain why an interviewer asks this question>",
      "answer": "<detailed answer with key points to cover>"
    },
    ... (7+ total questions)
  ],
  "behavioralQuestions": [
    {
      "question": "<behavioral question>",
      "intention": "<explain its purpose>",
      "answer": "<how to answer with specific examples>"
    },
    ... (5+ total questions)
  ],
  "skillGaps": [
    {
      "skill": "<specific skill name>",
      "severity": "<low|medium|high>"
    },
    ... (5+ total skills)
  ],
  "preparationPlan": [
    {
      "day": 1,
      "focus": "<main focus for this day>",
      "tasks": ["<task 1>", "<task 2>", "<task 3>"]
    },
    ... (7-10 days)
  ]
}

CRITICAL REQUIREMENTS:
- All arrays MUST be fully populated (not empty)
- Technical questions must match job requirements
- Each question MUST have intention and answer fields
- Preparation plan must be progressive and realistic
- Match score should be 0-100 based on resume vs job fit
- Return ONLY valid JSON, no explanations`;

        console.log("[AI Service] Calling Gemini API for interview report...");
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(interviewReportSchema),
            }
        })

        console.log("[AI Service] Response received from Gemini");
        
        if (!response || !response.text) {
            throw new Error("Empty response from Gemini API");
        }

        // Strip markdown code blocks if present
        let jsonText = response.text.trim();
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
        }

        const parsed = JSON.parse(jsonText);
        console.log("[AI Service] Successfully parsed interview report");
        console.log("[AI Service] Generated content:", {
            matchScore: parsed.matchScore,
            technicalQuestions: parsed.technicalQuestions?.length || 0,
            behavioralQuestions: parsed.behavioralQuestions?.length || 0,
            skillGaps: parsed.skillGaps?.length || 0,
            preparationPlan: parsed.preparationPlan?.length || 0
        });
        return parsed;
    } catch (error) {
        console.error("[AI Service] Error calling Gemini API:", error.message);
        console.error("[AI Service] Full error:", error);
        throw error;
    }
}



async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch()
    const page = await browser.newPage();
    
    // Set viewport to A4 dimensions
    await page.setViewport({ width: 794, height: 1123 })
    
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    // Get page dimensions to scale to fit 1 page
    const { width, height } = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
    }))
    
    // Scale down to fit on 1 page, but don't scale up
    const scale = Math.min(794 / width, 1123 / height, 1)

    const pdfBuffer = await page.pdf({
        format: "A4",
        scale: scale,
        margin: {
            top: "8mm",
            bottom: "8mm",
            left: "8mm",
            right: "8mm"
        },
        printBackground: true
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    try {
        const resumePdfSchema = z.object({
            html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
        })

        const prompt = `You are an expert resume writer specializing in ATS-optimized resumes. Create a professional, STRICTLY ONE-PAGE resume in HTML format.

CANDIDATE INFORMATION:
Current Resume/Experience:
${resume}

Self Description:
${selfDescription}

TARGET JOB:
${jobDescription}

CRITICAL REQUIREMENTS FOR THE RESUME:
1. STRICTLY MUST FIT ON ONE PAGE (A4 format)
2. ATS-FRIENDLY: Use clear structure, standard fonts (Arial, Calibri, or similar), proper semantic HTML
3. NO FANCY GRAPHICS: Only text and basic HTML formatting
4. HUMAN-WRITTEN STYLE: Reads naturally, not AI-generated sounding
5. JOB-TAILORED: Keywords from job description prioritized
6. CONTACT INFO: Include email (use placeholder if needed)
7. SECTIONS: Contact | Summary | Experience | Skills | Education (only essential)

ATS OPTIMIZATION RULES:
- Use HTML semantic tags (h1, h2, p, ul, li, div)
- No tables, no images, no decorative elements
- Simple headings and bullet points only
- Clear hierarchy: Name (largest), Sections (bold underline), Content (regular)
- Keywords naturally integrated into experience and summary
- Bullet points with action verbs (Developed, Implemented, Designed, Increased, Optimized, Built, Created, Led)
- Professional spacing: Tight but readable, no large gaps between sections
- Fills entire A4 page using all available space effectively
- No excessive padding or margins in content
- Use bullet point character (•) between skills for compact display

CONTENT GUIDELINES:
- Summary: 2-3 sentences maximum, focused on role match, no filler
- Experience: Show 2-3 most relevant positions, bullets are concise (1-2 lines), front-load achievements
- Skills: 10-15 most relevant technical skills separated by bullet points (•)
- Education: Degree, School, Graduation year only
- IMPORTANT: Fill the entire page - use all available space with content, minimize gaps
- Keep line heights tight (1.2-1.3) for professional compact look
- Use bullet points (•) between skills, not commas
- Abbreviate where professional (e.g., "Grad: 2023" vs "Graduated: 2023")
- Remove ALL unnecessary margins/padding - the template handles uniform spacing
- NO: Fancy fonts, colors (except black text), icons, graphics, or decorative elements


PERFECT RESUME STRUCTURE (HTML):
<html>
<head>
<style>
body {
  font-family: Arial, sans-serif;
  line-height: 1.3;
  font-size: 10px;
  margin: 0;
  padding: 0.4in;
  color: #000;
}
h1 {
  margin: 0 0 2px 0;
  font-size: 14px;
  font-weight: bold;
  text-align: center;
}
.contact {
  text-align: center;
  margin: 0 0 4px 0;
  font-size: 9px;
  border-bottom: 1px solid #000;
  padding-bottom: 4px;
}
h2 {
  margin: 4px 0 2px 0;
  font-size: 11px;
  font-weight: bold;
  border-bottom: 1px solid #000;
  padding-bottom: 1px;
}
.section {
  margin: 0 0 5px 0;
}
.job {
  margin: 3px 0 1px 0;
}
.job-title {
  margin: 0;
  font-weight: bold;
  font-size: 10px;
}
.job-details {
  margin: 0;
  font-size: 9px;
  color: #333;
}
ul {
  margin: 2px 0 0 0;
  padding-left: 15px;
}
ul li {
  margin: 0 0 2px 0;
  padding: 0;
  font-size: 10px;
  line-height: 1.25;
}
.skills-list {
  margin: 2px 0 0 0;
  font-size: 10px;
  line-height: 1.3;
}
.education {
  margin: 2px 0 0 0;
  font-size: 10px;
}
</style>
</head>
<body>
  <h1>[Full Name]</h1>
  <div class="contact">[Email] | [Phone] | [City, State]</div>

  <h2>PROFESSIONAL SUMMARY</h2>
  <div class="section">
    <p style="margin: 2px 0;">[2-3 sentence summary directly matching target role keywords]</p>
  </div>

  <h2>PROFESSIONAL EXPERIENCE</h2>
  <div class="section">
    <div class="job">
      <p class="job-title">[Job Title] | [Company Name]</p>
      <p class="job-details">[Month Year] – [Month Year]</p>
      <ul>
        <li>Accomplished achievement with quantifiable metrics/results aligned with role</li>
        <li>Implemented key responsibility demonstrating target skill from job description</li>
        <li>Improved or optimized process/system showing impact</li>
      </ul>
    </div>
    <div class="job">
      <p class="job-title">[Previous Job Title] | [Company Name]</p>
      <p class="job-details">[Month Year] – [Month Year]</p>
      <ul>
        <li>Led initiative or project with clear deliverable and impact</li>
        <li>Developed solution addressing key requirement from job description</li>
      </ul>
    </div>
  </div>

  <h2>SKILLS</h2>
  <div class="skills-list">[Skill1] • [Skill2] • [Skill3] • [Skill4] • [Skill5] • [Skill6] • [Skill7] • [Skill8] • [Skill9] • [Skill10]</div>

  <h2>EDUCATION</h2>
  <div class="education">[Degree Type] in [Major] | [University Name] | [Graduation Year]</div>
</body>
</html>

IMPORTANT:
- Use MINIMAL styling - only font-size, margin, padding, border-bottom
- NO colors, backgrounds, or decorations
- Ensure text fits in one A4 page
- Action verbs: Developed, Implemented, Designed, Led, Managed, Improved, Optimized, Built, Created, etc.
- Include specific technologies/tools from job description
- Quantify achievements where possible
- Write as if from candidate's perspective

Generate ONLY the HTML code, valid JSON format:
{
  "html": "<html>...</html>"
}`;

        console.log("[AI Service] Calling Gemini API for resume PDF...");
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(resumePdfSchema),
            }
        })

        console.log("[AI Service] Resume response received from Gemini");
        
        if (!response || !response.text) {
            throw new Error("Empty response from Gemini API for resume");
        }

        // Strip markdown code blocks if present
        let jsonText = response.text.trim();
        if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
        }

        const jsonContent = JSON.parse(jsonText);
        console.log("[AI Service] Successfully parsed resume HTML");

        const pdfBuffer = await generatePdfFromHtml(jsonContent.html);
        console.log("[AI Service] Successfully generated resume PDF - 1 page");

        return pdfBuffer;
    } catch (error) {
        console.error("[AI Service] Error generating resume PDF:", error.message);
        console.error("[AI Service] Full error:", error);
        throw error;
    }
}

module.exports = { generateInterviewReport, generateResumePdf }