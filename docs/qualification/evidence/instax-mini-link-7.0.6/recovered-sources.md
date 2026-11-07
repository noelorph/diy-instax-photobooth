# Instax mini Link 7.0.6 — recovered source evidence

Analysis date: 2026-11-02. These are static REA/JADX observations, not execution or physical printer evidence. The app was not launched. The project was not edited.

Base APK SHA-256: `95785e4cea57085904e1e112aff9578e05ca320a22f6b5a4b7862078f0e6090c`. REA 6.7.0; JADX headless MCP 0.7.1; Java 17.0.12. Complete original Evidence JSON files are adjacent. Decompiler aliases and enum-smali fallback are preserved.

## setFilmData

Evidence: `ev_bcd4df802ef607f2ce33f5e23f6671f8d8d7fd188b0df30a20daa04652378f01`. [Complete JSON](setFilmData.json).

Method: `com.fujifilm.bluetooth.models.InstaxPrinterInfo.setFilmData`. Representation: java. Fallback: False. Markers: [].

```java
    public final void setFilmData(byte b10) {
        this.filmRemain = (byte) (b10 & 15);
        this.batteryRemain = Integer.valueOf((b10 >> 4) & 7);
        this.chargeFlg = i.f13938a.a(b10, 7);
    }
```

## setStatusData

Evidence: `ev_51bace22003488c7797d62f0aa87cfa1ad48aa44f1afe1f027af93509a7040d6`. [Complete JSON](setStatusData.json).

Method: `com.fujifilm.bluetooth.models.InstaxPrinterInfo.setStatusData`. Representation: java. Fallback: False. Markers: [].

```java
    public final void setStatusData(byte b10) {
        i iVar = i.f13938a;
        this.backCoverState = iVar.a(b10, 0);
        this.printerOperationFlg = iVar.a(b10, 1);
        this.printerErrFlg = iVar.a(b10, 2);
        this.printerOperationInfo = Integer.valueOf((b10 >> 4) & 15);
    }
```

## status-bit-helper

Evidence: `ev_7d7f2e3e484714ba32a13e1222af1dc303c4a45381d359d6c7ef27bbd67143b6`. [Complete JSON](status-bit-helper.json).

Method: `W1.i.a`. Representation: java. Fallback: False. Markers: [].

```java
    public final boolean a(int i10, int i11) {
        return (((long) i10) & (1 << i11)) >= 1;
    }
```

## print-result-decoder

Evidence: `ev_e81eee8b3397408cc88f0d989fe038ac80ea01d5904404e666fbf68415cc7243`. [Complete JSON](print-result-decoder.json).

Method: `com.fujifilm.bluetooth.models.InstaxPrinterInfo.setResultData`. Representation: java. Fallback: False. Markers: [].

```java
    public final void setResultData(byte b10) {
        this.resultPrintRequest = z.f14046i.a(Integer.valueOf(b10));
    }
```

## print-result-codes

Evidence: `ev_88c422b293c546d1626e8f1144d0cc50ca5ee659fe653990607210a06b7db961`. [Complete JSON](print-result-codes.json).

Method: `W1.z.<clinit>`. Representation: smali. Fallback: True. Markers: ['static_initializer_disassembly'].

```smali
.method static constructor <clinit>()V
    .registers 9

    new-instance v0, LW1/z;

    const-string v1, "NORMAL_TERMINATION"

    const/4 v2, 0x0

    invoke-direct {v0, v1, v2, v2}, LW1/z;-><init>(Ljava/lang/String;II)V

    sput-object v0, LW1/z;->b:LW1/z;

    new-instance v1, LW1/z;

    const-string v2, "CAMERA_BACK_DOOR_OPEN"

    const/4 v3, 0x1

    invoke-direct {v1, v2, v3, v3}, LW1/z;-><init>(Ljava/lang/String;II)V

    sput-object v1, LW1/z;->c:LW1/z;

    new-instance v2, LW1/z;

    const-string v3, "NO_FILM_ERROR"

    const/4 v4, 0x2

    invoke-direct {v2, v3, v4, v4}, LW1/z;-><init>(Ljava/lang/String;II)V

    sput-object v2, LW1/z;->d:LW1/z;

    new-instance v3, LW1/z;

    const/4 v4, 0x3

    const/16 v5, 0x7f

    const-string v6, "PRINTER_PROCESSING"

    invoke-direct {v3, v6, v4, v5}, LW1/z;-><init>(Ljava/lang/String;II)V

    sput-object v3, LW1/z;->e:LW1/z;

    new-instance v4, LW1/z;

    const/4 v5, 0x4

    const/16 v6, 0xf0

    const-string v7, "ERROR_FLAG"

    invoke-direct {v4, v7, v5, v6}, LW1/z;-><init>(Ljava/lang/String;II)V

    sput-object v4, LW1/z;->f:LW1/z;

    new-instance v5, LW1/z;

    const/4 v6, 0x5

    const/4 v7, -0x1

    const-string v8, "OTHER_PRILIMINARY"

    invoke-direct {v5, v8, v6, v7}, LW1/z;-><init>(Ljava/lang/String;II)V

    sput-object v5, LW1/z;->g:LW1/z;

    filled-new-array/range {v0 .. v5}, [LW1/z;

    move-result-object v0

    sput-object v0, LW1/z;->h:[LW1/z;

    new-instance v0, LW1/z$a;

    const/4 v1, 0x0

    invoke-direct {v0, v1}, LW1/z$a;-><init>(Lxa/g;)V

    sput-object v0, LW1/z;->i:LW1/z$a;

    return-void
.end method
```

## isPrinterGood

Evidence: `ev_c1954de6ce0e05661d725359ca319ce37a70c53e63b5abb1f71d5691e8be6eea`. [Complete JSON](isPrinterGood.json).

Method: `com.fujifilm.bluetooth.models.InstaxPrinterInfo.isPrinterGood`. Representation: java. Fallback: False. Markers: [].

```java
    public final C isPrinterGood(boolean z10) {
        Integer num = this.batteryRemain;
        if ((num != null && num.intValue() == 0) || ((num == null || num.intValue() != 1) && ((num == null || num.intValue() != 2) && (num == null || num.intValue() != 3)))) {
            return C.LOW_POWER_ERROR;
        }
        if (!this.printerErrFlg) {
            if (this.printerOperationFlg) {
                return C.PRINTER_BUSY;
            }
            if (this.backCoverState) {
                return C.CAMERA_COVER_OPEN_ERROR;
            }
            return (this.filmRemain != 0 || z10) ? C.OK : C.CAMERA_NO_PAPER_ERROR;
        }
        z zVar = this.resultPrintRequest;
        if (zVar != null) {
            int i10 = WhenMappings.$EnumSwitchMapping$0[zVar.ordinal()];
            if (i10 == 1) {
                return C.CAMERA_NO_PAPER_ERROR;
            }
            if (i10 == 2) {
                return C.CAMERA_COVER_OPEN_ERROR;
            }
            if (i10 == 3) {
                return C.PENDING_RESPONSE;
            }
            if (i10 == 4) {
                return checkPrinterError();
            }
        }
        return checkPrinterError();
    }
```

## printer-status-parser

Evidence: `ev_7c40ed873188e86a6e99139b3aa75e50c7bacdd0eda0057cbdff9776ebbc067f`. [Complete JSON](printer-status-parser.json).

Method: `R1.q.<init>`. Representation: java. Fallback: False. Markers: [].

```java
    /* JADX WARN: 'super' call moved to the top of the method (can break code semantics) */
    public q(byte[] bArr) {
        b bVar;
        super(bArr);
        xa.m.h(bArr, "data");
        if (bArr.length < 13) {
            g(L1.o.INVALID_RESPONSE);
            f("Response packet size should be >= 13");
        }
        if (e() == L1.o.OK) {
            byte[] bArrB = b();
            if (bArrB == null) {
                xa.m.p();
            }
            DataInputStream dataInputStream = new DataInputStream(new ByteArrayInputStream(bArrB));
            F fA = F.f13872i.a(dataInputStream.readByte());
            this.f11757j = fA;
            if (fA == null) {
                return;
            }
            switch (r.f11772a[fA.ordinal()]) {
                case 1:
                    b bVar2 = new b();
                    this.f11758k = bVar2;
                    bVar2.l(dataInputStream.readShort());
                    b bVar3 = this.f11758k;
                    if (bVar3 != null) {
                        bVar3.g(dataInputStream.readShort());
                    }
                    b bVar4 = this.f11758k;
                    if (bVar4 != null) {
                        bVar4.j(dataInputStream.readByte());
                    }
                    b bVar5 = this.f11758k;
                    if (bVar5 != null) {
                        bVar5.h(dataInputStream.readByte());
                    }
                    b bVar6 = this.f11758k;
                    if (bVar6 != null) {
                        bVar6.k(dataInputStream.readInt());
                    }
                    if (bArr.length == 23 && (bVar = this.f11758k) != null) {
                        bVar.i(dataInputStream.readByte());
                        break;
                    }
                    break;
                case 2:
                    a aVar = new a();
                    this.f11759l = aVar;
                    aVar.e(dataInputStream.readByte());
                    a aVar2 = this.f11759l;
                    if (aVar2 != null) {
                        aVar2.d(dataInputStream.readByte());
                    }
                    a aVar3 = this.f11759l;
                    if (aVar3 != null) {
                        aVar3.g(dataInputStream.readByte());
                    }
                    a aVar4 = this.f11759l;
                    if (aVar4 != null) {
                        aVar4.f(dataInputStream.readByte());
                    }
                    break;
                case 3:
                    InstaxCameraInfo instaxCameraInfo = new InstaxCameraInfo();
                    this.f11760m = instaxCameraInfo;
                    instaxCameraInfo.setMaxFrameChangeInfo(dataInputStream.readByte());
                    InstaxCameraInfo instaxCameraInfo2 = this.f11760m;
                    if (instaxCameraInfo2 != null) {
                        instaxCameraInfo2.setFlashInfo(dataInputStream.readByte());
                    }
                    InstaxCameraInfo instaxCameraInfo3 = this.f11760m;
                    if (instaxCameraInfo3 != null) {
                        instaxCameraInfo3.setImageQualityMode(dataInputStream.readByte());
                    }
                    InstaxCameraInfo instaxCameraInfo4 = this.f11760m;
                    if (instaxCameraInfo4 != null) {
                        instaxCameraInfo4.setUploadInfo(dataInputStream.readByte());
                    }
                    InstaxCameraInfo instaxCameraInfo5 = this.f11760m;
                    if (instaxCameraInfo5 != null) {
                        instaxCameraInfo5.setCameraErrorType(dataInputStream.readInt());
                    }
                    break;
                case 4:
                    InstaxCameraInfo instaxCameraInfo6 = new InstaxCameraInfo();
                    this.f11760m = instaxCameraInfo6;
                    instaxCameraInfo6.setTotalShootNum(dataInputStream.readInt());
                    break;
                case 5:
                    InstaxPrinterInfo instaxPrinterInfo = new InstaxPrinterInfo();
                    this.f11761n = instaxPrinterInfo;
                    instaxPrinterInfo.setFilmData(dataInputStream.readByte());
                    InstaxPrinterInfo instaxPrinterInfo2 = this.f11761n;
                    if (instaxPrinterInfo2 != null) {
                        instaxPrinterInfo2.setStatusData(dataInputStream.readByte());
                    }
                    InstaxPrinterInfo instaxPrinterInfo3 = this.f11761n;
                    if (instaxPrinterInfo3 != null) {
                        instaxPrinterInfo3.setResultData(dataInputStream.readByte());
                    }
                    InstaxPrinterInfo instaxPrinterInfo4 = this.f11761n;
                    if (instaxPrinterInfo4 != null) {
                        instaxPrinterInfo4.setPrintWaitTime(dataInputStream.readByte());
                    }
                    InstaxPrinterInfo instaxPrinterInfo5 = this.f11761n;
                    if (instaxPrinterInfo5 != null) {
                        instaxPrinterInfo5.setErrorData(dataInputStream.readInt());
                    }
                    break;
                case 6:
                    InstaxPrinterInfo instaxPrinterInfo6 = new InstaxPrinterInfo();
                    this.f11761n = instaxPrinterInfo6;
                    instaxPrinterInfo6.setTotalPrintNum(dataInputStream.readInt());
                    InstaxPrinterInfo instaxPrinterInfo7 = this.f11761n;
                    if (instaxPrinterInfo7 != null) {
                        instaxPrinterInfo7.setTotalEjectFCNum(dataInputStream.readInt());
                    }
                    break;
            }
        }
    }
```

## function-selectors

Evidence: `ev_d74e8dd0503dddde2b3160355c1c2d6066312dc1d87c11a4050652fc81cdd71a`. [Complete JSON](function-selectors.json).

Method: `W1.F.<clinit>`. Representation: smali. Fallback: True. Markers: ['static_initializer_disassembly'].

```smali
.method static constructor <clinit>()V
    .registers 8

    new-instance v0, LW1/F;

    const-string v1, "IMAGE_SUPPORT_INFO"

    const/4 v2, 0x0

    invoke-direct {v0, v1, v2, v2}, LW1/F;-><init>(Ljava/lang/String;IB)V

    sput-object v0, LW1/F;->b:LW1/F;

    new-instance v1, LW1/F;

    const-string v2, "BATTERY_INFO"

    const/4 v3, 0x1

    invoke-direct {v1, v2, v3, v3}, LW1/F;-><init>(Ljava/lang/String;IB)V

    sput-object v1, LW1/F;->c:LW1/F;

    new-instance v2, LW1/F;

    const-string v3, "PRINTER_FUNCTION_INFO"

    const/4 v4, 0x2

    invoke-direct {v2, v3, v4, v4}, LW1/F;-><init>(Ljava/lang/String;IB)V

    sput-object v2, LW1/F;->d:LW1/F;

    new-instance v3, LW1/F;

    const-string v4, "PRINT_HISTORY_INFO"

    const/4 v5, 0x3

    invoke-direct {v3, v4, v5, v5}, LW1/F;-><init>(Ljava/lang/String;IB)V

    sput-object v3, LW1/F;->e:LW1/F;

    new-instance v4, LW1/F;

    const-string v5, "CAMERA_FUNCTION_INFO"

    const/4 v6, 0x4

    invoke-direct {v4, v5, v6, v6}, LW1/F;-><init>(Ljava/lang/String;IB)V

    sput-object v4, LW1/F;->f:LW1/F;

    new-instance v5, LW1/F;

    const-string v6, "CAMERA_HISTORY_INFO"

    const/4 v7, 0x5

    invoke-direct {v5, v6, v7, v7}, LW1/F;-><init>(Ljava/lang/String;IB)V

    sput-object v5, LW1/F;->g:LW1/F;

    filled-new-array/range {v0 .. v5}, [LW1/F;

    move-result-object v0

    sput-object v0, LW1/F;->h:[LW1/F;

    new-instance v0, LW1/F$a;

    const/4 v1, 0x0

    invoke-direct {v0, v1}, LW1/F$a;-><init>(Lxa/g;)V

    sput-object v0, LW1/F;->i:LW1/F$a;

    return-void
.end method
```

## official-print-poll

Evidence: `ev_d67644b7fdab5ed25d8fd49dfbcf561ff45f0b49dc42b60d5dc5dfc358cdd6e9`. [Complete JSON](official-print-poll.json).

Method: `T1.r.n`. Representation: java. Fallback: False. Markers: [].

```java
    @Override // T1.f
    public void n(byte[] bArr) throws InterruptedException {
        xa.m.h(bArr, "byteArray");
        O1.b bVar = new O1.b(bArr);
        L1.o oVarE = bVar.e();
        L1.o oVar = L1.o.OK;
        if (oVarE == oVar || t(bVar.c())) {
            int i10 = s.f12329a[bVar.d().ordinal()];
            if (i10 == 1) {
                R1.q qVar = new R1.q(bArr);
                if (qVar.e() != oVar && !t(qVar.c())) {
                    c(L1.o.INSTAX_ERROR, qVar.c(), qVar.a());
                } else if (this.f12318f == a.PRINTER_INFO_1) {
                    InstaxPrinterInfo instaxPrinterInfoK = qVar.k();
                    if (instaxPrinterInfoK == null) {
                        xa.m.p();
                    }
                    W1.C cIsPrinterGood = instaxPrinterInfoK.isPrinterGood(false);
                    if (cIsPrinterGood == W1.C.OK) {
                        this.f12318f = a.PRINT_COMMAND;
                    } else {
                        c(L1.o.INSTAX_ERROR, cIsPrinterGood, null);
                    }
                } else if (bVar.e() == oVar) {
                    InstaxPrinterInfo instaxPrinterInfoK2 = qVar.k();
                    if (instaxPrinterInfoK2 == null) {
                        xa.m.p();
                    }
                    W1.C cIsPrinterGood2 = instaxPrinterInfoK2.isPrinterGood(true);
                    if (cIsPrinterGood2 != W1.C.OK && cIsPrinterGood2 != W1.C.PRINTER_BUSY) {
                        c(L1.o.INSTAX_ERROR, cIsPrinterGood2, null);
                    } else if (!instaxPrinterInfoK2.getPrinterOperationFlg()) {
                        this.f12318f = a.COMPLETED;
                    }
                }
            } else if (i10 != 2) {
                c(L1.o.INSTAX_ERROR, null, "Current state: " + this.f12318f + " received sid: " + bVar.d());
            } else {
                R1.o oVar2 = new R1.o(bArr);
                if (oVar2.e() == oVar) {
                    Integer numI = oVar2.i();
                    if (numI == null) {
                        xa.m.p();
                    }
                    this.f12319g = Math.max(1, numI.intValue());
                    this.f12318f = a.PRINTER_INFO_2;
                } else {
                    c(L1.o.INSTAX_ERROR, oVar2.c(), oVar2.a());
                }
            }
        } else {
            c(L1.o.INSTAX_ERROR, bVar.c(), bVar.a());
        }
        s();
    }
```

## official-print-scheduler

Evidence: `ev_772320078f37638b1da763c0b7ac202095b60e5d986ab3a2b6078902b4d3ddda`. [Complete JSON](official-print-scheduler.json).

Method: `T1.r.s`. Representation: java. Fallback: False. Markers: [].

```java
    private final void s() throws InterruptedException {
        if (k()) {
            f().a(L1.o.CANCELLED, null);
            return;
        }
        int i10 = s.f12330b[this.f12318f.ordinal()];
        if (i10 == 1) {
            g();
            return;
        }
        if (i10 == 2) {
            this.f12322j.b(0);
            u();
            return;
        }
        if (i10 != 3) {
            if (i10 != 4) {
                return;
            }
            this.f12322j.b(100);
            f().a(i(), h());
            return;
        }
        int i11 = this.f12320h;
        this.f12320h = i11 + 1;
        this.f12322j.b(Math.min(99, Math.max(0, (i11 * 100) / this.f12319g)));
        Thread.sleep(1000L);
        g();
    }
```

## execute-print-response

Evidence: `ev_4bda148dd1cdb63975e60699e80b25c8a065866c11d82b2e9d659373e3a8699f`. [Complete JSON](execute-print-response.json).

Method: `R1.o.<init>`. Representation: java. Fallback: False. Markers: [].

```java
    /* JADX WARN: 'super' call moved to the top of the method (can break code semantics) */
    public o(byte[] bArr) {
        super(bArr);
        xa.m.h(bArr, "data");
        if (e() == L1.o.OK) {
            byte[] bArrB = b();
            if (bArrB == null) {
                xa.m.p();
            }
            this.f11748j = Integer.valueOf(new DataInputStream(new ByteArrayInputStream(bArrB)).readByte());
        }
    }
```

## film-set-color

Evidence: `ev_ff2529a7c055038d775bcf52c5b43105eb8fe0d7235ba370661ed1194fc6d89c`. [Complete JSON](film-set-color.json).

Method: `com.fujifilm.bluetooth.models.InstaxAdditionalPrinterInfo.setColorInfo$InstaxBluetoothLibrary_v13_0_0__release`. Representation: java. Fallback: False. Markers: [].

```java
    public final void setColorInfo$InstaxBluetoothLibrary_v13_0_0__release(a.C0153a c0153a) {
        m.h(c0153a, "info");
        this.totalNumberOfPrintAttempts = c0153a.d();
        this.batteryType = c0153a.a();
        this.colorVariant = c0153a.b();
        this.withOrWithoutFilmPI = c0153a.e() == 1;
        this.printerCpuType = c0153a.c();
    }
```

## film-response-dispatch

Evidence: `ev_a0f253879ac47a2a812da8822ea725901ca14b8ad6a9d3a72688c65d3f225923`. [Complete JSON](film-response-dispatch.json).

Method: `T1.t.n`. Representation: java. Fallback: False. Markers: [].

```java
    @Override // T1.f
    public void n(byte[] bArr) {
        xa.m.h(bArr, "byteArray");
        O1.b bVar = new O1.b(bArr);
        L1.o oVarE = bVar.e();
        L1.o oVar = L1.o.OK;
        if (oVarE == oVar) {
            if (u.f12340a[bVar.d().ordinal()] != 1) {
                c(L1.o.INSTAX_ERROR, null, "Current state: " + this.f12331f + " received sid: " + bVar.d());
            } else {
                R1.a aVar = new R1.a(bArr);
                if (aVar.e() == oVar && aVar.j() == W1.a.VOLTAGE_INFO) {
                    R1.a.b bVarK = aVar.k();
                    if (bVarK != null) {
                        this.f12332g.setVoltageInfo$InstaxBluetoothLibrary_v13_0_0__release(bVarK);
                    }
                    this.f12331f = a.COLOR_INFO;
                } else if (aVar.e() == oVar && aVar.j() == W1.a.COLOR_INFO) {
                    R1.a.C0153a c0153aI = aVar.i();
                    if (c0153aI != null) {
                        this.f12332g.setColorInfo$InstaxBluetoothLibrary_v13_0_0__release(c0153aI);
                    }
                    this.f12331f = a.COMPLETED;
                } else {
                    c(L1.o.INSTAX_ERROR, aVar.c(), aVar.a());
                }
            }
        } else {
            c(L1.o.INVALID_RESPONSE, bVar.c(), bVar.a());
        }
        s();
    }
```

## film-additional-parser

Evidence: `ev_1dd2982ff3cd03afe824ee0400dbbb91dc5c8b87531997cbed3856e233c9a574`. [Complete JSON](film-additional-parser.json).

Method: `R1.a.<init>`. Representation: java. Fallback: False. Markers: [].

```java
    /* JADX WARN: 'super' call moved to the top of the method (can break code semantics) */
    public a(byte[] bArr) throws IOException {
        super(bArr);
        xa.m.h(bArr, "data");
        if (e() == L1.o.OK) {
            byte[] bArrB = b();
            if (bArrB == null) {
                xa.m.p();
            }
            DataInputStream dataInputStream = new DataInputStream(new ByteArrayInputStream(bArrB));
            W1.a aVarA = W1.a.f13885f.a(dataInputStream.readByte());
            this.f11717j = aVarA;
            if (aVarA == null) {
                return;
            }
            int i10 = R1.b.f11727a[aVarA.ordinal()];
            if (i10 == 1) {
                b bVar = new b();
                this.f11718k = bVar;
                bVar.c(dataInputStream.readShort());
                b bVar2 = this.f11718k;
                if (bVar2 != null) {
                    bVar2.d(dataInputStream.readShort());
                    return;
                }
                return;
            }
            if (i10 != 2) {
                return;
            }
            C0153a c0153a = new C0153a();
            this.f11719l = c0153a;
            c0153a.i(dataInputStream.readInt());
            C0153a c0153a2 = this.f11719l;
            if (c0153a2 != null) {
                c0153a2.f(dataInputStream.readByte());
            }
            C0153a c0153a3 = this.f11719l;
            if (c0153a3 != null) {
                c0153a3.g(dataInputStream.readByte());
            }
            C0153a c0153a4 = this.f11719l;
            if (c0153a4 != null) {
                c0153a4.j(dataInputStream.readByte());
            }
            C0153a c0153a5 = this.f11719l;
            if (c0153a5 != null) {
                c0153a5.h(u.f14000f.a(dataInputStream.readByte()));
            }
        }
    }
```

## film-total-response-handler

Evidence: `ev_18448a5f2fbd52470e761088cc10dc863ce41571df3a41effbdb866d106e34dd`. [Complete JSON](film-total-response-handler.json).

Method: `T1.v.n`. Representation: java. Fallback: False. Markers: [].

```java
    @Override // T1.f
    public void n(byte[] bArr) {
        xa.m.h(bArr, "byteArray");
        O1.b bVar = new O1.b(bArr);
        L1.o oVarE = bVar.e();
        L1.o oVar = L1.o.OK;
        if (oVarE == oVar) {
            if (w.f12352a[bVar.d().ordinal()] != 1) {
                c(L1.o.INSTAX_ERROR, null, "Current state: " + this.f12342f + " received sid: " + bVar.d());
            } else {
                R1.q qVar = new R1.q(bArr);
                if (qVar.e() == oVar && qVar.l() == F.PRINTER_FUNCTION_INFO) {
                    InstaxPrinterInfo instaxPrinterInfoK = qVar.k();
                    if (instaxPrinterInfoK != null) {
                        this.f12343g = instaxPrinterInfoK;
                    }
                    this.f12342f = a.PRINTER_HISTORY;
                } else if (qVar.e() == oVar && qVar.l() == F.PRINT_HISTORY_INFO) {
                    InstaxPrinterInfo instaxPrinterInfoK2 = qVar.k();
                    if (instaxPrinterInfoK2 != null) {
                        this.f12343g.setTotalPrintNum(instaxPrinterInfoK2.getTotalPrintNum());
                        this.f12343g.setTotalEjectFCNum(instaxPrinterInfoK2.getTotalEjectFCNum());
                    }
                    this.f12342f = a.BATTERY_STATUS;
                } else if (qVar.e() == oVar && qVar.l() == F.BATTERY_INFO) {
                    R1.q.a aVarI = qVar.i();
                    if (aVarI != null) {
                        this.f12343g.setBatteryPercent(aVarI.a());
                    }
                    this.f12342f = a.COMPLETED;
                } else {
                    c(L1.o.INSTAX_ERROR, qVar.c(), qVar.a());
                }
            }
        } else {
            c(L1.o.INVALID_RESPONSE, bVar.c(), bVar.a());
        }
        s();
    }
```
