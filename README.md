# crack-commandline-book

## 다운로드

- 스킬 도감 설치 : https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/crack-skill-book.user.js
- 아이템 도감 설치 : https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/crack-item-book.user.js
- 지도 도감 설치 : https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/crack-map-book.user.js
	- 커스텀 지도 편집기 : https://hamster4762.github.io/crack-commandline-book/
- 몰입모드 설치 : https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/crack-immersion.user.js
- 키설정 설치 (PC전용) : https://github.com/hamster4762/crack-commandline-book/raw/refs/heads/main/crack-key-settings.user.js

## 사용법

- 채팅창에 '!' 입력하고 명령어 사용

## 커스텀 지도 생성방법

- 아래 블록에 원하는 세계관·지도 이름·지역 수를 덧붙여 AI에게 전달하세요.
- 결과를 `.json` 파일로 저장한 뒤 **커스텀 추가**에서 선택하면 됩니다.
- 배경 그림은 별도 이미지 파일로 선택합니다.

```text
다음 데이터 구조와 규칙으로 지도 JSON을 만들어 주세요.
최종 결과에는 설명이나 주석 없이 유효한 JSON만 코드블럭에 출력하세요.
지역은 60~100개 사이로 만들어야합니다.
세계관을 반영해 작성하세요. 세계관에 맞는 type만 사용해야합니다.

지도 전체:
- name: 지도 이름 문자열
- width, height: 지도의 가로·세로 칸 수. 양의 정수
- distanceScale: 거리 환산 배율. 인접지역 거리 계산에 사용
- backgroundImage: 커스텀 지도에서는 빈 문자열 ""로 둡니다.
- regions: 지역 객체 배열

각 지역:
- id: 지도 안에서 고유한 숫자. 양의 정수
- name: 지역 이름 문자열
- type: 허용값 중 하나. 영어 문자열
- scale: 규모 1~5 정수. 큰 값일수록 크게 표시됨
- x, y: 정수 좌표. 왼쪽 위가 (0, 0)이고 오른쪽으로 x, 아래로 y가 증가합니다. 반드시 0 <= x < width, 0 <= y < height를 만족해야 합니다.
- description: 특징·특산물·분위기를 담은 한줄설명 문자열
- neighbors: 직접 연결되는 다른 지역의 ID 배열. 연결이 없으면 []입니다.

type 허용값:
- 거점: kingdom(국가), capital(왕도), city(도시), town(소도시), village(마을),
        port(항구), fortress(요새), temple(성소)
- 자연: forest(숲), mountain(산), mountainRange(산맥), plains(평원),
        desert(사막), marsh(늪)
- 수역: coast(해안), sea(바다), river(강), lake(호수), island(섬)
- 미지·위험: ruins(유적), dungeon(던전), tower(마탑), rift(균열), volcano(화산)

연결과 이동 시간:
- neighbors는 실제로 존재하는 다른 지역의 ID만 참조하고 자기 자신은 넣지 않습니다.
- 연결은 양방향입니다. 한쪽에만 적어도 되며, 양쪽에 적어도 선은 하나만 표시됩니다.
- 지역 사이는 직선으로 연결됩니다. 실제로 왕래할 수 있는 관계만 연결해 주세요.
- 두 지역의 이동 시간(일) = sqrt((x1-x2)^2 + (y1-y2)^2) / distanceScale.
- 1일은 24시간이며, 표시 시간은 가장 가까운 1시간 단위로 반올림합니다.
  예: 좌표 거리 10, distanceScale 2이면 5일. 환산 거리 0.5이면 12시간입니다.

배치:
- 지역을 행·열에 맞춰 균등하게 배치하려하지 말것. 산맥·대삼림·사막과 같은 공간은 주변 마을이 적고 넓게 배치
- 왕도 주변, 강변, 항구와 교역로 주변에는 거점을 모을것
- 해안(coast)과 바다(sea)를 구분

형식 예시:
{
  "name": "여행자의 땅",
  "width": 80,
  "height": 60,
  "distanceScale": 2,
  "backgroundImage": "",
  "regions": [
    {
      "id": 1,
      "name": "시작 마을",
      "type": "village",
      "scale": 1,
      "x": 10,
      "y": 20,
      "description": "약초꾼과 여행자가 머무는 작은 마을.",
      "neighbors": [2]
    },
    {
      "id": 2,
      "name": "푸른 숲",
      "type": "forest",
      "scale": 4,
      "x": 20,
      "y": 20,
      "description": "오래된 나무와 희귀한 약초가 자라는 숲.",
      "neighbors": [1]
    }
  ]
}
```

## 커스텀 지도 배경 이미지 생성방법

```text
첨부한 JSON 데이터를 기준으로 지도 이미지를 제작해줘
중요: 이 작업은 "분위기 참고용 지도 그림 생성"이 아니라 "JSON 좌표 기반 배경 제작"이다. 좌표 불일치가 있으면 실패로 간주할 것

# 작업 목표
- 최종 결과물은 "지도 UI 뒤에 깔리는 배경 이미지"
- 지역명, 글자, 아이콘, 연결선은 그리지 말 것
- 그림은 보기 좋은 구도가 아니라 "JSON 좌표 일치"를 최우선으로 할 것

# 배치 기준
- JSON의 `width`, `height`를 최종 캔버스 비율로 사용할 것
- JSON의 `regions`가 가진 `x`, `y` 값은 각 지역의 "절대 기준 좌표"
	- 왼쪽 위가 (0, 0)이고 오른쪽으로 x, 아래로 y가 증가한다.
	- 최종이미지 크기에 맞춰 x/width, y/height가 동일하도록 좌표를 변환한다.
- 생성할 이미지의 모든 지형과 구조물은 반드시 data 좌표에 맞춰 배치해야한다.

## 지형 배치 규칙
- 도시, 마을, 항구, 요새, 탑, 신전, 폐허, 섬 등은 해당 `x`, `y` 중심 위치에 정확히 놓을 것
- 숲, 산맥, 사막, 늪, 평원, 해안, 바다 등 넓은 지형은 해당 좌표를 중심으로 자연스럽게 확장할 것
	- 단, 넓은 지형도 중심 위치와 방향성이 JSON상의 주변 지역 관계와 어긋나면 안 된다.
- 강, 호수, 해안선, 섬의 위치는 주변 지역 좌표와 연결 관계를 고려해 맞출 것
- 인접지역간 접근성과 지형적 관계를 바탕으로 적절한 연결 방식을 선택하고, 시각적으로 드러나는 이동 경로는 주변 환경에 자연스럽게 어우러지게 표현할것

# 스타일
- JSON의 name과 description을 참고하여 세계관의 시대적 배경, 기술수준, 건축양식, 분위기를 파악하고 이를 디자인에 반영할것
- 배경용 이미지에 적합하도록 색감을 절제할 것
	- 너무 강한 대비, 과한 광원은 피하고 가독성 좋은 차분한 색감을 사용할 것
- 세밀한 풍경 일러스트가 아닌 게임 월드맵에 적합한 지도화를 우선할것
	- 지형과 건축물의 특징을 유지하되 개별 사물의 묘사보다 지역의 형태와 공간적 구분이 드러나도록 적절히 단순화할것
	- 지역명과 아이콘이 나중에 올라가도 가독성을 해치지 않게 할 것

# 검증
- 완성 전에 JSON 좌표를 기준으로 주요 지형과 구조물의 중심 위치를 다시 대조할 것
- 배치가 어긋난 상태라면 완성으로 제출하지 말 것

## 중요한 우선순위
1. JSON 좌표 일치
2. 지역 간 상대적 위치 일치
3. 자연스러운 지형 및 공간 구조
4. 세계관과 시각적 디자인의 일관성
5. 지도에 적합한 정보 밀도와 가독성
```