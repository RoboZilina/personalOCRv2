export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({
          error: 'Use POST with JSON { "text": "..." }'
        }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json().catch(() => null);
      const inputText = (body && typeof body.text === 'string') ? body.text : '';

      if (!inputText || inputText.trim().length < 3) {
        return new Response(JSON.stringify({ validated: inputText }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Build prompt WITHOUT template literals
      let prompt = "";
      prompt += "You are a DEFENSIVE OCR VALIDATOR. ";
      prompt += "Fix ONLY obvious OCR errors. ";
      prompt += "Do NOT paraphrase. Do NOT change meaning. ";
      prompt += "Do NOT translate. Do NOT summarize. ";
      prompt += "Do NOT add or remove sentences. ";
      prompt += "If you are NOT SURE a change is correct, DO NOT CHANGE IT. ";
      prompt += "Allowed fixes: fix obvious character confusions (0/O, 1/l/I, rn/m), fix spacing, remove garbage characters, fix punctuation. ";
      prompt += "Forbidden: do NOT modify Japanese/Chinese/Korean text, do NOT modify names or technical terms unless trivial, do NOT rewrite style, do NOT hallucinate. ";
      prompt += "Return ONLY the corrected text or the original. ";
      prompt += "Input: " + inputText;

      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        prompt: prompt
      });

      let validated = inputText;

      if (aiResponse && typeof aiResponse === 'object') {
        if (typeof aiResponse.response === 'string') {
          validated = aiResponse.response.trim();
        } else if (typeof aiResponse.output === 'string') {
          validated = aiResponse.output.trim();
        }
      } else if (typeof aiResponse === 'string') {
        validated = aiResponse.trim();
      }

      if (!validated) validated = inputText;

      return new Response(JSON.stringify({ validated: validated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({
        validated: null,
        error: 'validation_failed'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
