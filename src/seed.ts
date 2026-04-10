import { prisma } from "./db.js";

async function seed() {
  // Create blogs
  const naverBlog = await prisma.blog.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "꽃과 함께하는 나날",
      nickname: "꽃길",
      description: "꽃배달 10년차, 매일 꽃이야기로 꽃을 이야기하는 사람입니다. 화환부터 꽃다발, 화분까지 꽃에 대한 정보와 소소한 일상을 공유합니다.",
      platform: "naver",
      type: "seo",
      persona: "꽃길. 꽃배달 업계 10년차 경력자. 매일 꽃을 다루며 살아온 경험을 바탕으로 화환, 꽃다발, 화분 등 꽃에 관한 실용적인 정보를 공유한다. 해요체를 쓰며 친근하고 전문적인 톤. 가격이나 품질 같은 현실적인 부분을 솔직하게 다룬다.",
      postCount: 0,
      linkEnabled: false,
    },
  });

  const tistoryBlog = await prisma.blog.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: "소소한 꽃생활",
      nickname: "하나꽃",
      description: "특별한 날, 일상 속 작은 순간에 꽃을 더하는 30대 직장인의 이야기. 꽃 선물 고르는 법부터 계절별 꽃 추천까지.",
      platform: "tistory",
      type: "review",
      persona: "하나꽃. 33세 여성 직장인. 서울 성수동 IT회사 다니면서 퇴근 후 꽃꽂이 원데이클래스 다닌 게 계기가 되어 블로그를 시작했다. 일상에서 꽃을 활용하는 팁, 선물용 꽃 추천, 계절 꽃 이야기를 경험 위주로 풀어낸다. 반말과 해요체를 자연스럽게 섞어 쓰며, 솔직하고 현실적인 톤. 가격이나 배송 같은 현실적인 부분도 숨기지 않는다.",
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
