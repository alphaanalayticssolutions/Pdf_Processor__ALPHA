import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a financial transaction categorizer.

INPUT: A JSON array of distinct transaction descriptions.

OUTPUT RULES:
- Return ONLY a valid JSON array. No markdown, no explanation, no preamble.
- Every input description must appear in the output exactly as given.
- Assign one category per description from this list ONLY:
  Food & Dining, Groceries, Gas & Fuel, Utilities, Shopping, Travel, Healthcare,
  Insurance, Rent & Mortgage, Loan Payment, Tax Payment, Payroll & Income,
  Bank Transfer, ATM Withdrawal, Check, Investment, Legal & Professional,
  Subscription & Membership, Auto & Transport, Entertainment, Charity & Donations,
  Government & Fees, Other

Format:
[
  {"description":"original description","category":"category name"}
]`;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function extractJSONArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("No JSON array found in Claude response");
  }
  return text.slice(start, end + 1);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { descriptions } = body;

    if (
      !descriptions ||
      !Array.isArray(descriptions) ||
      descriptions.length === 0
    ) {
      return Response.json(
        { error: "descriptions must be a non-empty array" },
        { status: 400 }
      );
    }

    const chunks = chunkArray(descriptions, 50);
    const allResults = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} descriptions)`);

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify(chunk),
          },
        ],
      });

      const text = message.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");

      const cleaned = text.replace(/```json|```/g, "").trim();
      const jsonText = extractJSONArray(cleaned);

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (err) {
        console.error("JSON parse failed for chunk:", i + 1, jsonText.slice(0, 200));
        throw new Error(`Claude returned invalid JSON for chunk ${i + 1}`);
      }

      if (!Array.isArray(parsed)) {
        throw new Error(`Claude did not return an array for chunk ${i + 1}`);
      }

      allResults.push(...parsed);
    }

    return Response.json({
      success: true,
      totalDescriptions: descriptions.length,
      results: allResults,
    });
  } catch (err) {
    console.error("Categorise descriptions error:", err.message);
    return Response.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}