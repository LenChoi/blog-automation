// 네이버 블로그 카테고리 매핑
const NAVER_CATEGORIES: { name: string; keywords: string[] }[] = [
  {
    name: "화환 가이드",
    keywords: ["화환", "근조", "축하", "개업", "장례", "부고", "조문", "리본", "문구", "당선", "취임", "결혼식 화환"],
  },
  {
    name: "꽃다발·꽃바구니",
    keywords: ["꽃다발", "꽃바구니", "생일", "프로포즈", "졸업", "기념일", "카네이션", "어버이날"],
  },
  {
    name: "화분·식물",
    keywords: ["화분", "식물", "난", "공기정화", "다육", "관리", "물주기", "키우기"],
  },
  {
    name: "꽃 이야기",
    keywords: ["꽃말", "꽃 종류", "꽃꽂이", "계절", "봄꽃", "가을꽃", "꽃 이름"],
  },
  {
    name: "꽃 선물 팁",
    keywords: ["추천", "선물", "배달", "주문", "에티켓", "상황별", "가격"],
  },
];

// 티스토리 카테고리
const TISTORY_CATEGORIES: { name: string; keywords: string[] }[] = [
  {
    name: "꽃 선물 이야기",
    keywords: ["꽃다발", "선물", "생일", "기념일", "프로포즈", "졸업", "어버이날", "카네이션"],
  },
  {
    name: "화환 알아보기",
    keywords: ["화환", "근조", "축하", "개업", "장례", "결혼식"],
  },
  {
    name: "화분·식물 생활",
    keywords: ["화분", "식물", "공기정화", "난", "관리", "키우기"],
  },
  {
    name: "꽃과 일상",
    keywords: ["꽃말", "계절", "꽃꽂이", "배달", "추천", "에티켓", "상황별"],
  },
];

export function mapToCategory(
  platform: "naver" | "tistory",
  keywordCategory: string,
  keyword: string,
): string {
  const categories = platform === "naver" ? NAVER_CATEGORIES : TISTORY_CATEGORIES;

  // 키워드 텍스트에서 매칭
  for (const cat of categories) {
    for (const kw of cat.keywords) {
      if (keyword.includes(kw)) {
        return cat.name;
      }
    }
  }

  // 키워드 카테고리로 폴백 매핑
  const categoryMap: Record<string, string> = platform === "naver"
    ? { "화환": "화환 가이드", "꽃다발": "꽃다발·꽃바구니", "화분": "화분·식물", "꽃지식": "꽃 이야기", "상황별": "꽃 선물 팁" }
    : { "화환": "화환 알아보기", "꽃다발": "꽃 선물 이야기", "화분": "화분·식물 생활", "꽃지식": "꽃과 일상", "상황별": "꽃과 일상" };

  return categoryMap[keywordCategory] || (platform === "naver" ? "꽃 이야기" : "꽃과 일상");
}

// 각 플랫폼의 전체 카테고리 목록
export function getCategoryList(platform: "naver" | "tistory"): string[] {
  const categories = platform === "naver" ? NAVER_CATEGORIES : TISTORY_CATEGORIES;
  return categories.map((c) => c.name);
}
