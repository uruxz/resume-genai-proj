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
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    try {
        const resumePdfSchema = z.object({
            html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
        })

        const prompt = `Generate a professional resume in HTML format for a candidate with the following details:

Resume: ${resume}

Self Description: ${selfDescription}

Job Description: ${jobDescription}

The response should be a JSON object with a single field "html" containing HTML content that can be converted to PDF.
The resume should be tailored for the given job description, highlight strengths and relevant experience.
The HTML should be well-formatted, visually appealing, ATS-friendly, and ideally 1-2 pages long when converted to PDF.
Focus on quality rather than quantity and include all relevant information to increase interview chances.
The content should read like a human-written resume, not AI-generated.`

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
        console.log("[AI Service] Successfully generated resume PDF");

        return pdfBuffer;
    } catch (error) {
        console.error("[AI Service] Error generating resume PDF:", error.message);
        console.error("[AI Service] Full error:", error);
        throw error;
    }
}

module.exports = { generateInterviewReport, generateResumePdf }