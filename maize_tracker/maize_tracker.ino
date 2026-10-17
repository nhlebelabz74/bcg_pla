// Maize bag tracking proof of concept
// Up to two RC522 readers on one Uno: R1 (SDA on D10) and R2 (SDA on D8).
// Breadboard setup: both readers on one Uno, R1 = in reader, R2 = out reader.
// Two Uno setup: one reader per Uno, always on D10. bridge.py renames each
// Uno's R1 to the reader it stands for (--port COM7:R1 --port COM9:R2).
// Which site the readers stand for (warehouse or shop) is set in tracker.py.
// Each scan is printed over serial as: SCAN,<READER>,<UID>
// Library: "MFRC522" by GithubCommunity (install via Library Manager)

#include <SPI.h>
#include <MFRC522.h>

const uint8_t RST_PIN = 9;               // shared reset line for both readers
const uint8_t NUM_READERS = 2;
const uint8_t SS_PINS[NUM_READERS] = {10, 8};
const char* READER_IDS[NUM_READERS] = {"R1", "R2"};

MFRC522 readers[NUM_READERS];
bool present[NUM_READERS];               // a reader that is not wired is never polled

void setup() {
  Serial.begin(9600);
  while (!Serial) {}
  SPI.begin();

  for (uint8_t i = 0; i < NUM_READERS; i++) {
    readers[i].PCD_Init(SS_PINS[i], RST_PIN);
    delay(10);
    // 0x91 / 0x92 = genuine chip, many clones report 0x12 or 0xB2 and still work.
    // 0x00 or 0xFF means the reader is not wired correctly.
    byte version = readers[i].PCD_ReadRegister(MFRC522::VersionReg);
    present[i] = version != 0x00 && version != 0xFF;
    Serial.print(F("INFO,"));
    Serial.print(READER_IDS[i]);
    Serial.print(F(",version=0x"));
    Serial.println(version, HEX);
  }
  Serial.println(F("INFO,READY"));
}

void loop() {
  for (uint8_t i = 0; i < NUM_READERS; i++) {
    if (!present[i]) continue;
    if (!readers[i].PICC_IsNewCardPresent()) continue;
    if (!readers[i].PICC_ReadCardSerial()) continue;

    Serial.print(F("SCAN,"));
    Serial.print(READER_IDS[i]);
    Serial.print(',');
    for (byte b = 0; b < readers[i].uid.size; b++) {
      if (readers[i].uid.uidByte[b] < 0x10) Serial.print('0');
      Serial.print(readers[i].uid.uidByte[b], HEX);
    }
    Serial.println();

    // Halt the tag so holding it on the reader does not produce repeat scans.
    // Lift it off and present it again to scan it again.
    readers[i].PICC_HaltA();
    readers[i].PCD_StopCrypto1();
  }
}
