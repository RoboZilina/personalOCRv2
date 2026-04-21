export default {
  async fetch(request, env, ctx) {
    try {
      // Only allow POST
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Use POST with JSON { "text": "..." }' }),
          {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Parse JSON body
      const body = await request.json().catch(() => null);
      const inputText =
        body && typeof body.text === 'string' ? body.text : '';

      // If empty or too short, return unchanged
      if (!inputText || inputText.trim().length < 3) {
        return new Response(JSON.stringify({ validated: inputText }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Validation prompt
      const prompt = `
You are a DEFENSIVE OCR VALIDATOR.

Your job:
- Fix ONLY obvious OCR errors.
- Do NOT paraphrase.
- Do NOT change meaning.
- Do NOT translate.
- Do NOT summarize.
- Do NOT add or remove sentences.
- If you are NOT SURE a change is correct, DO NOT CHANGE IT.

Allowed fixes:
- Fix obvious character confusions (0/O, 1/l/I, rn/m, etc.) when context is clear.
- Fix broken spacing and duplicated spaces.
- Remove stray garbage characters ( , random punctuation at edges).
- Fix obviously broken punctuation (e.g., "Hello,, world!!" → "Hello, world!").

Forbidden:
- Do NOT modify Japanese, Chinese, or Korean text.
- Do NOT modify names or technical terms unless the correction is trivial and certain.
- Do NOT rewrite style or wording.
- Do NOT hallucinate missing content.

Return ONLY the corrected text, or the original text if no safe corrections are possible.

Input:
${inputText}
`;

      // Call Cloudflare Workers AI
      const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        prompt,
      });

      // Extract validated text
      let validated = inputText;

      if (response && typeof response === 'object') {
        if (typeof response.response === 'string') {
          validated = response.response.trim();
        } else if (typeof response.output === 'string') {
          validated = response.output.trim();
        }
      } else if (typeof response === 'string') {
        validated = response.trim();
      }

      if (!validated) validated = inputText;

      return new Response(JSON.stringify({ validated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ validated: null, error: 'validation_failed' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
