# Codeberg 비공개 저장소 설정

이 프로젝트는 GitHub과 Codeberg 양쪽에 비공개로 푸시할 수 있도록 원격이 설정되어 있습니다.

## GitHub으로 Codeberg 로그인한 경우 — 푸시 인증 (Access Token)

Codeberg에 **GitHub으로 로그인**했어도, Git 푸시는 **Codeberg Access Token**으로 해야 합니다. (GitHub 비밀번호는 사용하지 않습니다.)

### 1) Codeberg에서 토큰 만들기

1. <https://codeberg.org> 접속 후 **로그인** (필요 시 "GitHub 으로 로그인" 사용).
2. 오른쪽 상단 **프로필 사진** 클릭 → **Settings**.
3. 왼쪽 메뉴에서 **Applications** 탭 선택.
4. **Manage Access Tokens** → **Generate New Token** 클릭.
5. **Token Name**에 식별용 이름 입력 (예: `tubescout-push`) 후 생성.
6. 표시된 토큰을 **한 번만** 복사해 안전한 곳에 보관 (다시 볼 수 없음).

### 2) 푸시할 때 사용하기

터미널에서 `git push -u codeberg master` 실행 시:

- **Username:** Codeberg 사용자명 (프로필 URL에 나오는 이름, GitHub 아이디와 다를 수 있음).
- **Password:** 방금 복사한 **Access Token** (일반 비밀번호 아님).

Windows에서 자격 증명이 저장되면 다음부터는 토큰 입력 없이 푸시할 수 있습니다.

---

## 사전 조건

- Codeberg 계정 (<https://codeberg.org>)
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

- 사용자명/비밀번호를 묻으면: **사용자명** = Codeberg 사용자명, **비밀번호** = 위에서 만든 **Access Token**을 입력합니다.

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
