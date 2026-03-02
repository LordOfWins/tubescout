# TubeScout

YouTube 크리에이터용 AI 분석 도구 모노레포. **Private repository**로 관리합니다.

## 저장소 (Private)

- **GitHub:** https://github.com/LordOfWins/tubescout (비공개, 푸시 완료)
- **Codeberg:** 동일 코드를 Codeberg에도 푸시하려면 아래 절차를 따르세요.

### Codeberg에 처음 푸시하기

1. https://codeberg.org 로그인 후 **New Repository** → 이름 `tubescout`, **Private** 선택 후 생성.
2. Codeberg 사용자명이 GitHub과 다르면 원격 URL 수정:
   ```bash
   git remote set-url codeberg https://codeberg.org/YOUR_CODEBERG_USER/tubescout.git
   ```
3. 푸시:
   ```bash
   git push -u codeberg master
   ```
4. 이후 푸시는 `git push origin master` (GitHub), `git push codeberg master` (Codeberg) 각각 실행하거나, 두 원격에 한 번에 푸시하려면:
   ```bash
   git push origin master && git push codeberg master
   ```

## 구조

- **extension/** — Chrome Extension (MV3). 팝업/사이드패널, YouTube DOM 연동.
- **server/** — FastAPI 백엔드. 인증(라이선스), 크레딧, AI 분석, 웹훅.
- **docs/** — 아키텍처, API 명세, 배포, 스토어 제출 문서.
- **scripts/** — 빌드/배포 스크립트 (선택).

## 시작

- Extension: `extension/`에서 `npm install` 후 `npm run build`.
- Server: 가상환경 생성 후 `pip install -r requirements/base.txt`, `uvicorn app.main:app`.

자세한 내용은 `docs/` 참고.
