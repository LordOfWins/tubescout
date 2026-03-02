// ============================================================
// TubeScout Extension — Webpack Build Configuration
// ============================================================
//
// 빌드 명령어:
//   개발:  npm run dev     → source map 포함, 미압축
//   배포:  npm run build   → Terser minify, 소스맵 제거
//   감시:  npm run watch   → 파일 변경 시 자동 리빌드
//
// 주의: Chrome Web Store 정책상 obfuscation 금지.
//       Terser minification만 사용 (변수명 단축 + 공백 제거).
// ============================================================

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    // ── 모드 ──
    mode: isProd ? 'production' : 'development',

    // ── 진입점: Chrome 확장의 3개 독립 컨텍스트 ──
    // 각 entry는 별도의 번들로 출력됨
    entry: {
      background: './src/background/index.js',
      content: './src/content/index.js',
      popup: './src/popup/popup.js',
      // sidebar는 향후 추가 시 여기에 entry 등록
      // sidebar: './src/sidebar/sidebar.js',
    },

    // ── 출력 ──
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].bundle.js',  // background.bundle.js, content.bundle.js, popup.bundle.js
      clean: true,                 // 빌드 전 dist/ 폴더 자동 정리
    },

    // ── 소스맵 ──
    // 개발: cheap-module-source-map (빠르고 디버깅 가능)
    // 배포: false (소스맵 미포함 → 코드 역추적 방지)
    devtool: isProd ? false : 'cheap-module-source-map',

    // ── 모듈 해석 ──
    resolve: {
      extensions: ['.js', '.json'],
      alias: {
        // @ 로 lib 폴더 접근: import { apiCall } from '@lib/api'
        '@lib': path.resolve(__dirname, 'src/lib'),
      },
    },

    // ── 로더 ──
    module: {
      rules: [
        // CSS: content script용 스타일 → 별도 CSS 파일로 추출
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
          ],
        },
      ],
    },

    // ── 최적화 ──
    optimization: {
      minimize: isProd,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            // ── Chrome Web Store 허용 범위 내 minification ──
            compress: {
              drop_console: isProd,     // 배포 시 console.log 제거
              drop_debugger: isProd,    // 배포 시 debugger 문 제거
              passes: 2,               // 2-pass 압축 (더 작은 결과)
              pure_funcs: isProd
                ? ['console.log', 'console.info', 'console.debug']
                : [],
            },
            mangle: {
              // 변수/함수명을 짧은 이름으로 단축 (a, b, c...)
              // Chrome Web Store에서 "shortening of variable and function names"로 허용
              reserved: ['chrome'],    // chrome API 글로벌은 맹글링 제외
            },
            format: {
              comments: false,         // 모든 주석 제거
            },
          },
          extractComments: false,       // LICENSE.txt 별도 생성 안 함
        }),
      ],

      // ── 코드 스플리팅 비활성화 ──
      // Chrome 확장에서는 chunk splitting이 불필요하고 오히려 문제를 일으킴
      // (manifest.json에 선언한 파일만 로드 가능)
      splitChunks: false,
      runtimeChunk: false,
    },

    // ── 플러그인 ──
    plugins: [
      // CSS를 JS에 인라인하지 않고 별도 파일로 추출
      new MiniCssExtractPlugin({
        filename: '[name].bundle.css',  // content.bundle.css
      }),

      // webpack이 번들링하지 않는 정적 파일들을 dist/로 복사
      new CopyWebpackPlugin({
        patterns: [
          // manifest.json → dist 루트
          {
            from: 'manifest.json',
            to: 'manifest.json',
            // 빌드 시 manifest 내 경로를 번들 파일명에 맞게 변환
            transform(content) {
              const manifest = JSON.parse(content.toString());

              // 번들 파일 경로로 업데이트
              manifest.background.service_worker = 'background.bundle.js';
              manifest.content_scripts[0].js = ['content.bundle.js'];
              manifest.content_scripts[0].css = ['content.bundle.css'];
              manifest.action.default_popup = 'popup.html';

              return JSON.stringify(manifest, null, isProd ? 0 : 2);
            },
          },

          // 아이콘
          {
            from: 'assets',
            to: 'assets',
          },

          // Popup HTML
          {
            from: 'src/popup/popup.html',
            to: 'popup.html',
            // HTML 내 스크립트/CSS 경로를 번들 파일명으로 교체
            transform(content) {
              return content.toString()
                .replace('popup.js', 'popup.bundle.js')
                .replace('popup.css', 'popup.bundle.css');
            },
          },

          // i18n 로케일
          {
            from: '_locales',
            to: '_locales',
            noErrorOnMissing: true,  // 아직 없어도 빌드 실패 안 함
          },
        ],
      }),
    ],

    // ── 성능 경고 ──
    performance: {
      hints: isProd ? 'warning' : false,
      maxAssetSize: 512 * 1024,   // 512KB 초과 시 경고
      maxEntrypointSize: 512 * 1024,
    },

    // ── 통계 출력 ──
    stats: {
      all: false,
      errors: true,
      warnings: true,
      assets: true,
      timings: true,
    },
  };
};
