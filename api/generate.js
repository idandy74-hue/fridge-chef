export default async function handler(req, res) {
  // POST 방식만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed'
    });
  }

  // 환경변수에서 Gemini API 키 가져오기
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.'
    });
  }

  const {
    imageBase64,
    seasonings,
    style
  } = req.body;

  if (!imageBase64) {
    return res.status(400).json({
      error: '이미지 데이터가 전달되지 않았습니다.'
    });
  }

  // Base64 헤더 제거
  const cleanBase64 =
    imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;

  const prompt = `당신은 냉장고 자투리 식재료 구조 전문 셰프입니다.
제공된 냉장고 사진을 정밀 분석하여 아래 JSON 규격으로만 응답해 주세요. 다른 마크다운이나 일반 텍스트는 일절 제외하세요.

사용자 보유 양념: [${(seasonings || []).join(', ')}]
요청 스타일: ${style || '15분 초간단 자취요리'}

JSON 규격:
{
  "detected_ingredients": ["인식된 재료1", "인식된 재료2"],
  "recipes": [
    {
      "name": "요리 이름",
      "summary": "한 줄 소개",
      "time": "15분",
      "difficulty": "쉬움",
      "ingredients": ["주재료1", "주재료2"],
      "seasonings": ["사용된 양념1"],
      "steps": ["1. 조리 순서 첫 번째", "2. 조리 순서 두 번째"],
      "chef_tip": "셰프 조리 꿀팁",
      "storage_tip": "남은 식재료 신선 보관법"
    }
  ]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: cleanBase64
                  }
                }
              ]
            }
          ],

          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();

      return res.status(response.status).json({
        error: `Gemini API 에러: ${errText}`
      });
    }

    const data = await response.json();

    const rawText =
      data.candidates[0]
        .content.parts[0]
        .text;

    const parsedData = JSON.parse(
      rawText
        .replace(/```json|```/g, '')
        .trim()
    );

    return res.status(200).json(parsedData);

  } catch (error) {
    return res.status(500).json({
      error:
        error.message ||
        '서버 내부 처리 오류'
    });
  }
}
