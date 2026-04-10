import { prisma } from "./db.js";

async function seed() {
  // Create blogs
  const naverBlog = await prisma.blog.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "꽃향기 가득한 일상",
      platform: "naver",
      type: "seo",
      persona: "꽃을 좋아하는 30대 여성 블로거. 3년째 블로그를 운영 중이며, 꽃과 화분에 대한 정보를 공유하는 걸 좋아합니다. 자연스럽고 친근한 말투를 씁니다.",
      postCount: 0,
      linkEnabled: false,
    },
  });

  const tistoryBlog = await prisma.blog.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: "일상 속 작은 선물",
      platform: "tistory",
      type: "review",
      persona: "일상을 공유하는 30대 직장인. 특별한 날 꽃을 선물하거나 받은 경험을 솔직하게 공유합니다. 반말과 해요체를 섞어 씁니다.",
      postCount: 0,
      linkEnabled: true,
    },
  });

  console.log("Created blogs:", naverBlog.name, tistoryBlog.name);

  // Create initial keywords
  const naverKeywords = [
    { keyword: "개업 화환 보내는 법", category: "화환", searchVolume: 400 },
    { keyword: "장례식 화환 가격", category: "화환", searchVolume: 1000 },
    { keyword: "꽃다발 선물 추천 여자친구", category: "꽃다발", searchVolume: 600 },
    { keyword: "화분 키우기 쉬운 종류", category: "화분", searchVolume: 800 },
    { keyword: "난 화분 물주기 방법", category: "화분", searchVolume: 400 },
    { keyword: "결혼기념일 꽃 추천", category: "꽃다발", searchVolume: 500 },
    { keyword: "근조 화환 문구 모음", category: "화환", searchVolume: 700 },
    { keyword: "승진 축하 화환 추천", category: "화환", searchVolume: 350 },
    { keyword: "꽃말 모음 계절별 정리", category: "꽃지식", searchVolume: 500 },
    { keyword: "공기정화 화분 추천 사무실", category: "화분", searchVolume: 650 },
  ];

  const tistoryKeywords = [
    { keyword: "장례식 화환 보낸 후기", category: "화환", searchVolume: 400 },
    { keyword: "여자친구 생일 꽃다발 후기", category: "꽃다발", searchVolume: 500 },
    { keyword: "개업 화분 선물 후기", category: "화분", searchVolume: 350 },
    { keyword: "어버이날 카네이션 배달 후기", category: "꽃다발", searchVolume: 400 },
    { keyword: "프로포즈 꽃다발 준비 후기", category: "꽃다발", searchVolume: 400 },
    { keyword: "병원 개원 축하 화환 후기", category: "화환", searchVolume: 350 },
    { keyword: "졸업식 꽃다발 준비 팁", category: "꽃다발", searchVolume: 550 },
    { keyword: "결혼식 축하 화환 종류", category: "화환", searchVolume: 400 },
    { keyword: "회사 이전 축하 화분 추천", category: "화분", searchVolume: 350 },
    { keyword: "화환 당일배송 가능한 곳", category: "화환", searchVolume: 650 },
  ];

  for (const kw of naverKeywords) {
    await prisma.keyword.upsert({
      where: { keyword: kw.keyword },
      update: {},
      create: { ...kw, blogId: naverBlog.id, difficulty: kw.searchVolume < 500 ? "low" : "mid" },
    });
  }

  for (const kw of tistoryKeywords) {
    await prisma.keyword.upsert({
      where: { keyword: kw.keyword },
      update: {},
      create: { ...kw, blogId: tistoryBlog.id, difficulty: kw.searchVolume < 500 ? "low" : "mid" },
    });
  }

  console.log(`Seeded ${naverKeywords.length + tistoryKeywords.length} keywords`);
  console.log("Done!");
}

seed().then(() => process.exit(0));
