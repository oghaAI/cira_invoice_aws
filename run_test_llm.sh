#!/bin/bash

MARKDOWN=$(cat <<'MD'
<!-- image -->

## SUNRISEONTHEGREENCONDOMINIUMASSOCIATION, Here's what you owe for this billing period.

## CURRENT BILL

$218.33

TOTALAMOUNTYOUOWE

Mar 21, 2025

NEWCHARGESDUEBY

Scanto

Pay or visit

FPL.com/ WaystoPay

<!-- image -->

## BILL SUMMARY

Amount of yourlast bill

228.00

Payments received

-228.00

Balance before new charges

0.00

Total new charges

218.33

Total amount you owe

$218.33

(See page 2 for bill details.)

Newratesareineffecttoreflectnewsolarenergycenterscomingonline. Learn more atFPL.com/Rates.

CustomerService:(954)581-5668 OutsideFlorida:1-800-226-3545

<!-- image -->

SUNRISE ON THE GREENCONDOM INIUM ASSOCIATION 9050PINESBLVDSTE480 PEMBROKEPINESFL33024-6432

Report Power Outages: Hearing/SpeechImpaired:

27

59108-72018

ACCOUNT NUMBER

ElectricBillStatement For:Jan 31,2025 to Feb 28,2025 (28 days) StatementDate:Feb28,2025 AccountNumber:59108-72018 Service Address: 4001NUNIVERSITYDR#REC SUNRISE,FL33351
MD
)

DOTENV_CONFIG_PATH=.env node -r dotenv/config scripts/test-llm.js --print-messages "$MARKDOWN"
