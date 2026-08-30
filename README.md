# Movie Reservation API

영화 목록, 상영 시간, 좌석 조회, 예매와 예매 내역 조회를 제공하는 Node.js + PostgreSQL API입니다.

이 시스템에서는 기능을 넓히는 것보다 두 가지를 먼저 해결했습니다. 동시에 같은 좌석을 요청해도 한 사람만 예매를 확정할 것, 서버가 응답을 보내기 전에 연결이 끊겨도 사용자가 같은 예매 결과를 다시 확인할 수 있을 것입니다.

## 실행

### Docker Compose

```bash
docker compose up --build
```

PostgreSQL 18.6, migration/seed, NestJS API가 차례로 실행됩니다. 이 Compose 파일은 로컬 개발 실행 경로이므로 앱의 `NODE_ENV`도 `development`로 둡니다. 호스트 PostgreSQL과의 충돌을 피하기 위해 DB는 기본적으로 `localhost:15432`를 사용합니다.

```bash
POSTGRES_HOST_PORT=25432 docker compose up --build
```

API는 `http://localhost:3000/api/v1`, Swagger UI는 `http://localhost:3000/api-docs`에서 확인할 수 있습니다. 상태 확인용 endpoint는 `/healthz`, `/readyz`입니다.

![실행 중인 Swagger UI](docs/images/swagger-api.png)

Prometheus와 Grafana는 API를 빠르게 확인하는 기본 실행에 섞지 않고 선택 profile로 분리했습니다.

```bash
docker compose --profile monitoring up --build
```

Prometheus는 `http://localhost:9090`, Grafana는 `http://localhost:3001`에서 열립니다. Grafana의 `admin` / `admin` 계정은 로컬 확인용이며 운영 환경에서는 별도 secret을 사용해야 합니다. `/metrics`도 외부 인터넷이 아니라 내부 scrape 경로로 제한하는 것을 전제로 합니다.

초기화가 필요할 때만 volume까지 내립니다.

```bash
docker compose down -v
```

### 로컬 실행

Node.js 24 LTS와 PostgreSQL 18 이상을 기준으로 작성했습니다. PostgreSQL 18을 선택한 이유는 `reservations.public_id`를 DB의 `uuidv7()` 기본값으로 생성하기 위해서입니다.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate:seed
pnpm start:dev
```

`.env`의 `JWT_SECRET`은 개발 환경에서도 임의의 긴 값으로 바꾸어 사용합니다. 배포 환경에서는 이미지나 저장소가 아닌 secret manager 또는 배포 환경 변수로 `JWT_SECRET`, `DATABASE_URL`을 주입합니다. `NODE_ENV=production`에서 둘 중 하나가 로컬 기본값으로 남아 있으면 앱이 시작하지 않습니다.

## API

```text
POST   /api/v1/auth/signup
POST   /api/v1/auth/login
GET    /api/v1/movies
GET    /api/v1/movies/:movieId/screenings
GET    /api/v1/screenings/:screeningId/seats
POST   /api/v1/screenings/:screeningId/reservations
GET    /api/v1/reservations
GET    /api/v1/reservations/:publicId
```

공개 API는 회원가입, 로그인, 영화·상영·좌석 조회뿐입니다. 나머지는 전역 JWT guard가 보호하며 `Authorization: Bearer <accessToken>`을 받습니다. 예매 생성은 요청을 구분하기 위한 `Idempotency-Key`도 필요합니다.

```http
POST /api/v1/screenings/1/reservations
Authorization: Bearer <accessToken>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{ "seatIds": [1, 2] }
```

응답은 성공과 실패를 같은 바깥 형태로 맞췄습니다. 클라이언트가 HTTP status와 오류 코드를 함께 보고 처리할 수 있도록 한 선택입니다.

```json
{
  "success": true,
  "data": {
    "reservationId": "018fe2f7-...",
    "screeningId": 1,
    "seatIds": [1, 2]
  }
}
```

```json
{
  "success": false,
  "error": {
    "type": "https://api.reservation-system.local/problems/seat-already-reserved",
    "title": "Seat already reserved",
    "status": 409,
    "code": "SEAT_ALREADY_RESERVED",
    "detail": "One or more requested seats are already reserved."
  },
  "traceId": "92f9a6d2-..."
}
```

인증되지 않은 요청은 401을 반환합니다. 다른 사용자의 예약 상세는 존재 여부를 알리지 않기 위해 404로 응답합니다.

business API는 처음부터 `/api/v1` 아래에 두었습니다. 성공 응답은 global interceptor, 예외 응답은 global exception filter가 처리하므로 controller마다 응답 형식을 직접 만들지 않습니다. 새 endpoint를 추가할 때 응답 규칙이나 인증 처리를 빼먹을 가능성을 줄이는 대신 Swagger schema도 이 공통 형식과 함께 관리해야 합니다.

## 예매를 확정하는 방식

상영마다 `screening_seats` 행을 만들고, `reservation_id`가 비어 있으면 예매 가능한 좌석으로 봅니다. 별도의 좌석 상태 컬럼을 두지 않아 서로 다른 상태 값이 어긋나는 일을 피했습니다.

예매 요청은 PostgreSQL의 `READ COMMITTED` 트랜잭션 안에서 아래 순서로 처리합니다.

```text
Idempotency-Key 확인
  -> 이전 요청이면 기존 예약 반환
  -> 새 요청이면 상영 시작 여부 확인
  -> 요청 좌석을 seat_id 순서로 SELECT ... FOR UPDATE
  -> 좌석 존재 여부와 이미 예매됐는지 확인
  -> reservation 생성
  -> reservation_id IS NULL 조건으로 좌석 배정
  -> idempotency key와 reservation 연결
  -> COMMIT
```

여러 좌석을 요청해도 `seat_id` 오름차순으로 잠그므로 서로 반대 순서로 잡는 경우를 줄였습니다. 락을 잡는 조회에는 `reservation_id IS NULL` 조건을 넣지 않습니다. 먼저 요청 좌석을 모두 잠근 뒤 이미 예매된 좌석과 없는 좌석을 판별해야 충돌을 정확히 알려줄 수 있기 때문입니다.

마지막 좌석 배정은 다시 `reservation_id IS NULL`을 조건으로 둔 update입니다. update된 행 수가 요청 좌석 수와 다르면 일반적인 좌석 충돌로 넘기지 않고 트랜잭션을 중단합니다. 락을 잡은 뒤의 기대와 실제 DB 상태가 다르다는 뜻이므로, 조용히 성공 처리하는 편이 더 위험합니다.

DB 제약도 같은 방향으로 두었습니다.

| 확인할 내용                              | DB에서 막는 방식                           |
| ---------------------------------------- | ------------------------------------------ |
| 다른 상영의 좌석을 예매에 섞는 요청      | screening/seat 복합 FK                     |
| 좌석의 상영과 예약의 상영이 다른 경우    | reservation/screening 복합 FK              |
| 멱등키와 예약 사용자가 다른 경우         | reservation/user 복합 FK                   |
| 한 좌석을 둘 이상의 예약에 연결하는 경우 | `screening_seats.reservation_id` 단일 참조 |
| 여러 좌석 예매 중 일부만 반영되는 경우   | 하나의 DB 트랜잭션                         |

## 같은 요청과 실패 처리

`Idempotency-Key`는 같은 요청의 결과를 다시 찾기 위한 키입니다. 같은 사용자가 같은 key와 같은 body를 다시 보내면 기존 예약을 돌려주고, 같은 key에 다른 좌석 목록을 보내면 422 `IDEMPOTENCY_KEY_REUSED`로 막습니다. 좌석을 두 번 예매하지 않게 하는 일은 멱등키가 아니라 위의 row lock, 조건부 update, FK가 맡습니다.

서버가 commit 전에 종료되면 PostgreSQL이 작업을 롤백하고 row lock도 해제합니다. 더 까다로운 경우는 commit은 끝났는데 응답을 보내기 전에 네트워크가 끊기는 상황입니다. 이때 클라이언트는 새 key를 만들지 않고 같은 key와 body로 다시 요청해야 확정된 예약을 안전하게 확인할 수 있습니다.

| 사용자에게 보이는 결과                    | 클라이언트 처리                                                     |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `201 Created`                             | 예매가 확정됐으므로 좌석 지도를 다시 읽습니다.                      |
| `409 SEAT_ALREADY_RESERVED`               | 자동 재시도하지 않고 좌석 지도를 새로 읽어 다른 선택을 돕습니다.    |
| `422 IDEMPOTENCY_KEY_REUSED`              | 같은 key에 다른 의도가 섞인 경우라 사용자의 선택을 다시 확인합니다. |
| `503 RESERVATION_TEMPORARILY_UNAVAILABLE` | `Retry-After`를 따르며 같은 key와 body로 제한적으로 재시도합니다.   |
| network timeout 또는 connection reset     | 결과를 모르는 상황이므로 같은 key와 body로 제한적으로 재시도합니다. |

`PG_SEAT_LOCK_TIMEOUT_MS=500`은 사용자에게 보여 주는 대기 시간이 아니라 DB 연결을 오래 붙잡지 않기 위한 상한입니다. 먼저 시작한 요청이 끝나면 뒤 요청은 바로 201 또는 409를 받습니다. 500ms를 넘기면 503과 `Retry-After: 1`을 반환합니다. 클라이언트가 이 API를 연결한다면 503과 네트워크 오류는 1초 간격에 작은 jitter를 더해 최대 두 번 재시도하는 정책으로 시작하고, 실제 실패율과 대기 시간을 보고 조정하는 편이 낫습니다. 무한 재시도는 오히려 경합을 키웁니다.

## 좌석을 보는 화면

이 API는 결제 없는 즉시 확정 모델입니다. 좌석 지도는 커밋된 예약만 보여 주며, 다른 사용자가 `FOR UPDATE`로 잠깐 잠그고 있는 좌석을 `RESERVING`으로 따로 표시하지 않습니다. 아직 확정되지 않은 DB lock을 화면 상태로 만들면 서버 종료나 연결 단절 뒤에 사용자가 보던 상태와 실제 상태가 어긋날 수 있기 때문입니다.

클라이언트는 예매 버튼을 누른 동안 자신이 고른 좌석만 로컬 `submitting` 상태로 비활성화합니다. 성공하면 좌석 지도를 다시 조회하고, 409이면 누군가 먼저 예매한 좌석을 알려 준 뒤 최신 지도를 보여 줍니다. 짧은 트랜잭션 안에서 확정 또는 실패를 알려 주는 방식이 이 범위에서는 오래 남는 임시 점유보다 예측 가능하다고 봤습니다.

결제가 추가되는 제품이라면 판단이 달라집니다. 그때는 `AVAILABLE -> HELD -> BOOKED` 상태와 hold 만료 시각, 결제 실패 보상, 만료 작업, 재시도와 cache 갱신을 한 흐름으로 추가해야 합니다. Redis는 빠른 hold나 초기 거절에 도움을 줄 수 있지만, 재시작과 만료 시점에도 PostgreSQL의 최종 확정 규칙이 유지되어야 합니다. 결제 API가 없는 현재 범위에서 hold만 먼저 넣으면 구현과 장애 처리만 커지므로 넣지 않았습니다.

## 선택한 이유

이 서비스는 단일 프로세스에서 시작하는 모듈형 모놀리식 구조입니다. 예매처럼 규칙이 많은 부분은 application/domain/ports와 PostgreSQL adapter를 나누고, 읽기 전용인 catalog는 Controller -> QueryService -> SQL로 단순하게 두었습니다. 모든 기능에 같은 계층을 강제하면 조회 코드까지 DTO와 인터페이스만 늘어나기 때문입니다.

| 선택                       | 비교한 대안                     | 결정한 이유와 비용                                                                                                                                                                                                  |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NestJS + 직접 SQL          | Express + 직접 DI, NestJS + ORM | 모듈, DI, validation, guard/filter 경계는 프레임워크 도움을 받고 좌석 정합성 SQL은 숨기지 않는 조합을 택했습니다. 작은 API에는 Express가 더 가볍지만, 공통 인증과 예외 처리를 직접 조립하는 비용이 더 컸습니다.     |
| PostgreSQL 트랜잭션        | Redis lock, Kafka, 별도 queue   | 좌석의 최종 소유자는 결국 DB에서 결정됩니다. 별도 인프라는 이벤트 재처리, lock 유실, 운영 복구 지점을 추가하므로 현재 트래픽과 제품 범위에서는 도입하지 않았습니다.                                                 |
| `pg` 직접 SQL              | ORM                             | `SELECT ... FOR UPDATE`, 조건부 update, 복합 FK가 핵심이라 SQL이 코드에서 바로 보이는 쪽을 선택했습니다. ORM의 생산성 이점보다 동시성 흐름을 검토하기 쉬운 편이 이 경우 더 컸습니다.                                |
| JWT access token           | 서버 세션, refresh token        | API 범위에는 짧은 access token으로 충분했습니다. refresh token을 추가하면 저장, 폐기, 탈취 대응까지 함께 설계해야 하므로 제외했습니다.                                                                              |
| 영화 목록만 HTTP cache     | Redis cache, 모든 조회 cache    | 영화 목록은 조금 늦어도 좌석 확정에 영향이 없습니다. 상영 시간과 좌석 지도는 `no-store`로 두어 사용자의 선택은 최신 응답을 기준으로 하게 했습니다.                                                                  |
| Prometheus/Grafana profile | 기본 compose에 항상 포함        | API 실행과 검증이 기본 목적이므로 필요한 서비스만 기본으로 띄웠습니다. 운영 신호를 볼 때만 profile로 추가해 비용과 시작 시간을 줄였습니다.                                                                          |
| Pino JSON 로그             | Nest 기본 logger, Winston       | stdout JSON과 request correlation을 적은 설정으로 남기기에 맞았습니다. Winston은 다양한 transport가 필요할 때 유리하지만 현재는 운영 복잡도만 늘립니다. SLF4J는 JVM용 facade라 Node.js의 직접 비교 대상이 아닙니다. |
| Vitest + PostgreSQL e2e    | Jest, mock만 사용하는 테스트    | 러너 성능보다 실제 DB lock과 FK를 확인하는 편이 중요했습니다. 단위 테스트는 빠르게 유지하고, 동시성 경로는 Testcontainers PostgreSQL에서 별도로 검증했습니다.                                                       |

고수요 오픈처럼 DB 처리량보다 더 많은 요청이 들어오는 상황에서는 예매 트랜잭션 안에 queue를 섞기보다 앞단 waiting room, rate limit, traffic shaping으로 유입을 조절하는 편이 책임이 분명합니다. 이 구현은 그 운영 시스템까지 만들지 않고, DB timeout과 관측 지표를 두어 병목을 먼저 알 수 있게 했습니다.

현재 기능에는 회원 탈퇴, 상영 관리, 예매 취소가 없어서 모든 테이블에 `deleted_at`, `updated_at`을 관성적으로 넣지 않았습니다. `deleted_at`은 모든 조회가 삭제 조건을 지켜야 하고, PostgreSQL의 `updated_at`은 매 update마다 규칙을 추가해야 합니다. 취소가 필요해지면 단순 soft delete 대신 `cancelled_at`, 좌석 해제, 환불 상태를 하나의 트랜잭션으로 설계하는 편이 맞습니다.

## 설정, cache, index

주요 수치는 `.env.example`로 분리했습니다. 현재 값은 로컬 compose와 동시성 검증에서 지나치게 많은 연결이나 긴 대기를 만들지 않는 시작값입니다.

| 설정                             | 기본값 | 의미                                                       |
| -------------------------------- | -----: | ---------------------------------------------------------- |
| `PG_POOL_MAX`                    |     10 | 로컬 DB에 과도한 세션을 만들지 않는 pool 상한              |
| `PG_IDEMPOTENCY_LOCK_TIMEOUT_MS` |    300 | 같은 key 요청끼리 오래 기다리지 않는 상한                  |
| `PG_SEAT_LOCK_TIMEOUT_MS`        |    500 | 좌석 lock 대기로 pool이 묶이지 않게 하는 상한              |
| `PG_STATEMENT_TIMEOUT_MS`        |   3000 | 개별 SQL의 실행 시간 상한                                  |
| `PG_IDLE_IN_TX_TIMEOUT_MS`       |   4000 | 트랜잭션을 열어 둔 유휴 세션의 상한                        |
| `PG_TRANSACTION_TIMEOUT_MS`      |   5000 | 트랜잭션 전체 시간 상한                                    |
| `RESERVATION_MAX_SEATS`          |      8 | 한 요청이 잠그는 좌석 수를 제한                            |
| `RESERVATION_TX_RETRY_ATTEMPTS`  |      2 | deadlock/serialization failure에 대한 트랜잭션 재시도 횟수 |
| `JWT_EXPIRES_IN_SECONDS`         |   3600 | refresh token이 없는 범위에서 짧게 둔 access token 수명    |

`GET /api/v1/movies`는 `public, max-age=300, stale-while-revalidate=60` 헤더를 보냅니다. 서버 메모리나 Redis에 별도의 값을 쌓지 않으므로 앱 재시작과 다중 인스턴스 cache 무효화 문제를 만들지 않습니다. 상영 목록과 좌석 지도는 `Cache-Control: no-store`입니다. 예매 POST는 어느 cache도 보지 않고 PostgreSQL에서 다시 판정합니다.

인덱스도 현재 쿼리와 제약에 맞춰 제한적으로 두었습니다. `lower(email)` unique index는 가입 중복 검사와 로그인에, `(movie_id, starts_at)`은 영화별 상영 시간 조회에, `(screening_id, seat_id)` PK는 정렬 lock과 좌석 배정에 사용됩니다. `idx_reservations_user_recent`은 사용자별 최신 예매를 cursor pagination으로 읽기 위한 index입니다. 좌석 지도는 특정 빈 좌석만 찾는 API가 아니라 해당 상영의 모든 좌석을 보여 주므로 `available` partial index를 추가하지 않았습니다.

## 로그와 모니터링

응답의 `X-Request-Id`와 오류 응답의 `traceId`는 같은 값입니다. 클라이언트가 이 값을 전달하면 서버는 유효한 형식일 때 그대로 사용하고, 없으면 새 UUID를 만듭니다. 사용자 문의의 오류 응답과 서버 로그를 연결할 수 있게 하기 위해서입니다.

Pino는 JSON 로그를 표준 출력으로 남깁니다. 요청 완료와 실패, 예매 생성과 멱등 재응답, 트랜잭션 재시도, PostgreSQL pool 상태를 기록합니다. password, JWT, `Authorization`, cookie, request body는 로그에 넣지 않으며 redaction도 적용했습니다. health check와 Prometheus scrape은 반복 호출이 많아 일반 요청 완료 로그에서 제외했습니다.

Prometheus endpoint는 HTTP 요청 수·지연 시간, pool 전체/idle/waiting connection, Node.js runtime 지표를 제공합니다. path에 들어가는 숫자 ID와 UUID는 `/:id`, `/:uuid`로 정규화해 label 수가 끝없이 늘지 않게 했습니다. 예매 실패율과 p95 지연 시간이 함께 오르면 좌석 lock 경합을, `pg_pool_waiting_clients`까지 오르면 pool 포화나 앞단 유입 조절을 먼저 살펴볼 수 있습니다.

## 검증

```bash
pnpm build
pnpm lint
pnpm test
RUN_E2E=1 pnpm test:e2e
```

단위 테스트는 command 정규화, 설정 값, cursor와 오류 경로를 확인합니다. e2e는 실제 PostgreSQL에서 회원가입/로그인, 인증 실패, 영화·상영·좌석 조회, 예매 생성, 멱등 재요청, 같은 key의 다른 body, 이미 예매된 좌석, 타인 예약 상세, cursor pagination, 시작된 상영 예매 차단을 확인합니다.

compose 실행 뒤에는 API 전체 흐름을 한 번에 확인할 수 있습니다.

```bash
pnpm smoke:api
```

k6가 설치된 환경에서는 동일 좌석으로 10개 동시 요청을 보냅니다. 기대 결과는 201 한 건, 409 아홉 건, DB의 reservation과 좌석 배정 각 한 건입니다.

```bash
k6 run load-test/reservation-concurrency.js
```

제출용 압축 파일은 폴더를 직접 압축하지 않고 아래 스크립트로 만듭니다. `node_modules`, `dist`, `.DS_Store`, Docker volume 데이터가 들어가지 않습니다.

```bash
pnpm submission:zip
```

## 작업 기준

`AGENTS.md`, `CLAUDE.md`, `.codex/skills`, `.claude/skills`에는 예매 구현과 검증에 반복 적용한 기준을 두었습니다. 특히 좌석을 정렬해 잠근 뒤 확인할 것, 멱등키 처리와 좌석 배정을 같은 트랜잭션에 둘 것, DB 동작이 중요한 내용은 PostgreSQL 기반 테스트로 확인할 것을 명시했습니다.

AI 도구는 대안을 빠르게 검토하고 누락된 실패 경로를 찾는 데 사용했습니다. 최종 선택은 코드와 테스트 결과로 다시 확인했으며, 지침 파일은 그 검토 기준을 다음 작업에서도 반복하기 위한 용도입니다.
