# Codeberg 비공개 저장소 설정

이 프로젝트는 GitHub과 Codeberg 양쪽에 비공개로 푸시할 수 있도록 원격이 설정되어 있습니다.

## 사전 조건

- Codeberg 계정 (https://codeberg.org)
- 로컬에 `codeberg` 원격이 추가된 상태 (기본: `https://codeberg.org/LordOfWins/tubescout.git`)

## 1. Codeberg에서 저장소 생성

1. Codeberg 로그인 후 **New Repository** 클릭.
2. Repository name: `tubescout`
3. **Private** 선택 후 Create Repository.

## 2. 사용자명이 다른 경우

Codeberg 사용자명이 GitHub 계정(LordOfWins)과 다르면 원격 URL을 수정합니다.

```bash
git remote set-url codeberg https://codeberg.org/YOUR_CODEBERG_USERNAME/tubescout.git
```

## 3. 최초 푸시

```bash
git push -u codeberg master
```

이후 Codeberg만 푸시할 때:

```bash
git push codeberg master
```

## 4. GitHub + Codeberg 동시 푸시

```bash
git push origin master && git push codeberg master
```

## 원격 확인

```bash
git remote -v
```

- `origin` → GitHub
- `codeberg` → Codeberg
