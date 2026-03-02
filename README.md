# TubeScout

YouTube 크리에이터용 AI 분석 도구 모노레포. **Private repository**로 관리합니다.

## 저장소 (Private)

- 이 프로젝트는 비공개 저장소입니다.
- 원격 저장소 생성 시 **Private**로 생성한 뒤 아래처럼 연결합니다.

```text
# GitHub 예시: New repository → Private 선택 후 생성
git remote add origin https://github.com/YOUR_ORG/tubescout.git
git branch -M main
git add .
git commit -m "Initial commit"
git push -u origin main
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
