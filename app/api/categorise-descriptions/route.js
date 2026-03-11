import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a financial transaction categorizer. Your job is to assign a category to each transaction description.

BEFORE YOU BEGIN:
Scan the entire batch first. Do not assign any category until you have reviewed all descriptions and completed full merchant normalization across the whole dataset.

STEP 1 — MERCHANT NORMALIZATION
- Identify the core merchant, brand, or service from each description
- Normalize variations of the same merchant into one identity
- Group all descriptions by normalized merchant before assigning any category
- Example normalizations:
  "DOMINOS", "DOMINO'S", "DOMINOS PIZZA", "DOMINOS #4521" → DOMINOS
  "UBER TRIP", "UBER *TRIP HELP.UBER.COM", "UBER BV" → UBER
  "AMZN MKTPLACE", "AMAZON.COM", "AMAZON PRIME" → AMAZON

STEP 2 — CATEGORY ASSIGNMENT
- Assign one category per normalized merchant — every variation gets the same category, no exceptions
- Use the PRIMARY purpose of the transaction when multiple categories could apply
- For ambiguous retailers (Walmart, Target), default to Shopping unless description explicitly says Grocery
- If you cannot confidently identify the merchant or type, assign Other — never guess
- Do not modify the original description text

CATEGORIES:
- Food → restaurants, fast food, coffee, dining (Dominos, McDonald's, Starbucks, Chipotle)
- Grocery → grocery stores (Pick N Save, Aldi, Kroger, Whole Foods, Walmart Grocery)
- Gas → fuel stations (Shell, BP, Exxon, Chevron, Mobil, Speedway)
- Utilities → phone, internet, electricity bills (AT&T, Verizon, ComEd)
- Shopping → retail and online (Amazon, Kohl's, Target, Walmart, Best Buy)
- Loan Payment → card payments, loan payments, AUTOPAY, minimum payment
- Tax → IRS payments, state tax
- Government Benefits → SSA, Social Security, government deposits
- Travel → airlines, hotels, rideshare, parking (Uber, Lyft, Airbnb)
- Healthcare → pharmacy, hospital, doctor (CVS, Walgreens)
- Subscription → streaming or recurring services (Netflix, Spotify, Apple, Google)
- Transfer → money transfers (Zelle, Venmo, PayPal, ACH, wire transfer)
- Salary / Income → payroll, direct deposit
- Other → does not clearly fit any category above

These category examples are GUIDANCE only, not strict keyword rules. Use reasoning to identify merchant type.
If a transaction clearly belongs to a category not listed above, you may create one — but stay consistent across the full dataset.

INPUT: A JSON array of distinct transaction descriptions.
OUTPUT: Return ONLY a valid JSON array. No explanation, no markdown, no extra text.
Format: [{"description": "original description", "category": "category name"}, ...]`;

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { descriptions } = body;

    if (!descriptions || !Array.isArray(descriptions) || descriptions.length === 0) {
      return Response.json(
        { error: "descriptions must be a non-empty array" },
        { status: 400 }
      );
    }

    const chunks = chunkArray(descriptions, 50);
    const allResults = [];

    for (const chunk of chunks) {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
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

      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      if (!Array.isArray(parsed)) {
        throw new Error("Claude did not return a valid JSON array");
      }

      allResults.push(...parsed);
    }

    return Response.json({
      success: true,
      totalDescriptions: descriptions.length,
      results: allResults,
    });
  } catch (err) {
    console.log("Categorise descriptions error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}