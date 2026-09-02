# 타운빌더

2.5D 아이소메트릭 마을 건설 게임. 자원을 모아 완성된 건물을 즉시 짓고, 주민을 늘려
마을 레벨을 올린다. 스토리와 대사창은 없다 — 모든 안내는 토스트와 아이콘으로 한다.

- 기획서: [`docs/plan/project.md`](docs/plan/project.md)
- 개발 로드맵: [01 MVP](docs/plan/roadmap_01.md) · [02 완성도](docs/plan/roadmap_02.md) ·
  [03 콘텐츠 확장](docs/plan/roadmap_03.md)
- 기술 결정 기록: [`docs/adr/`](docs/adr)

## 플레이

배포 주소: `https://seniya.github.io/game-dev1/`

> 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 설정하고 `main`에 올리면
> [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)이 빌드해 배포한다.

진행 상황은 브라우저 localStorage(`townbuilder.save.v1`)에 자동 저장되며, 30초마다와
건축 완공·레벨업 시점에 남는다. 새로고침해도 이어서 플레이된다.

## 조작

| 키 | 하는 일 |
|---|---|
| `W` `A` `S` `D` / 방향키 | 걷기 |
| `1`~`9` | 도구 선택. 건축 모드에서는 설계도 선택 |
| 좌클릭 / `Space` | 커서가 놓인 칸에 채집·파기(건축 모드에서는 배치 확정) |
| 우클릭 | 블록 쌓기 |
| `E` | 창고에 예치 |
| `B` | 건축 모드 켜고 끄기 |
| `Esc` | 건축 모드 끄기 |
| `X` | 건물 철거(자재 절반 회수) |
| `R` | 주민 요청 납품 |
| 드래그 / 휠 | 시야 이동 / 확대 |

## 개발

```sh
npm install
npm run dev        # 개발 서버
npm test           # 단위 테스트
npm run typecheck  # 타입 검사
npm run build      # 타입 검사 + 프로덕션 빌드
```

빌드는 GitHub Pages 경로(`/game-dev1/`)를 기준으로 나온다. 개발 서버는 루트(`/`)에서 돈다.
