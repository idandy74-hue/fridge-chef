export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vercel 환경변수에 GEMINI_API_KEY가 등록되지 않았습니다.' });
  }

  const { imageBase64, seasonings, style } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: '이미지가 전달되지 않았습니다.' });
  }

  const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

  const prompt = `당신은 냉장고 자투리 식재료 전문 셰프입니다.
제공된 사진 속 식재료를 식별하고, 사용자가 가진 양념을 활용해 최적의 레시피를 제안해 주세요.
반드시 아래 JSON 포맷으로만 응답해 주세요 (마크다운 백틱 제외):

보유 양념: [${(seasonings || []).join(', ')}]
희망 요리 스타일: ${style || '초간단'}

JSON 규격:
{
  "detected_ingredients": ["식재료1", "식재료2"],
  "recipes": [
    {
      "name": "요리명",
      "summary": "한 줄 소개",
      "time": "15분",
      "difficulty": "쉬움",
      "ingredients": ["주재료1", "주재료2"],
      "seasonings": ["양념1", "양념2"],
      "steps": ["1. 조리 순서", "2. 조리 순서"],
      "chef_tip": "조리 꿀팁",
      "storage_tip": "식재료 보관 팁"
    }
  ]
}`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: cleanBase64 } }
      ]
    }],
    generationConfig: { response_mime_type: 'application/json' }
  };

  // 503 트래픽 과부하를 분산하기 위한 모델 목록 (우선순위 순서)
  const models = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.8-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        const parsedData = JSON.parse(rawText.replace(/```json|```/g, '').trim());
        return res.status(200).json(parsedData);
      }

      // 503(일시적 과부하)일 때만 즉시 다음 모델 클러스터로 넘김
      if (response.status === 503) {
        continue;
      }

      const errText = await response.text();
      lastError = `[${model}] ${response.status}: ${errText}`;
      break;
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(503).json({ error: lastError || '구글 서버 혼잡으로 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
}
