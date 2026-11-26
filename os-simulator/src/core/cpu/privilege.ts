import type { HardwarePrivilegeState } from "./types.js";

const USER_STACK_BASE = 0xbffff000;
const KERNEL_STACK_BASE = 0xc0002000;

export const LDE_STEPS: readonly HardwarePrivilegeState[] = [
  {
    stepIndex: 0,
    stageName: "Boot & Inizializzazione OS (Ring 0)",
    cpl: 0,
    currentInstruction: "lidt [idt_ptr] ; setup_tss_esp0",
    stackPointer: 0xbffff000,
    kernelStackPointer: KERNEL_STACK_BASE,
    savedTrapFrame: null,
    stepDescription:
      "All'avvio della macchina, la CPU opera a CPL=0 (Ring 0). Il kernel configura la IDT (Interrupt Descriptor Table) registrando l'handler di sistema a int 0x80 e imposta esp0 nel Task State Segment (TSS).",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" }
    ],
    kernelStack: []
  },
  {
    stepIndex: 1,
    stageName: "Lancio del Programma Utente tramite iret",
    cpl: 0,
    currentInstruction: "iret ; switch to Ring 3",
    stackPointer: USER_STACK_BASE - 8,
    kernelStackPointer: KERNEL_STACK_BASE,
    savedTrapFrame: null,
    stepDescription:
      "Il kernel predispone lo stack kernel con le informazioni del processo utente ed esegue l'istruzione privilegiata 'iret'. L'hardware della CPU abbassa il CPL da 0 a 3, carica CS/EIP utente e passa il controllo.",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" }
    ],
    kernelStack: []
  },
  {
    stepIndex: 2,
    stageName: "Esecuzione in User Mode (CPL = 3)",
    cpl: 3,
    currentInstruction: "mov eax, 4 ; mov ebx, 1 ; mov ecx, msg",
    stackPointer: USER_STACK_BASE - 12,
    kernelStackPointer: KERNEL_STACK_BASE,
    savedTrapFrame: null,
    stepDescription:
      "Il codice applicativo viene eseguito direttamente dalla CPU con CPL=3 (Limited Execution). Le istruzioni privilegiate sono bloccate dall'hardware. Il programma prepara gli argomenti per la syscall write(1, buf, len).",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" },
      { address: USER_STACK_BASE - 12, value: "0x08049000 (buf pointer)" }
    ],
    kernelStack: []
  },
  {
    stepIndex: 3,
    stageName: "Generazione del Trap (int 0x80 / syscall)",
    cpl: 3,
    currentInstruction: "int 0x80 ; Trap instruction",
    stackPointer: USER_STACK_BASE - 12,
    kernelStackPointer: KERNEL_STACK_BASE,
    savedTrapFrame: null,
    stepDescription:
      "Il processo richiede un servizio al sistema operativo eseguendo l'istruzione 'int 0x80'. L'hardware CPU intercetta l'istruzione di trap e avvia la transizione sicura di privilegio.",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" },
      { address: USER_STACK_BASE - 12, value: "0x08049000 (buf pointer)" }
    ],
    kernelStack: []
  },
  {
    stepIndex: 4,
    stageName: "Commutazione Hardware dello Stack e Salvataggio Trap Frame",
    cpl: 0,
    currentInstruction: "[CPU Hardware: switch to TSS esp0, push SS, ESP, EFLAGS, CS, EIP]",
    stackPointer: USER_STACK_BASE - 12,
    kernelStackPointer: KERNEL_STACK_BASE - 20,
    savedTrapFrame: {
      ss: 0x2b,
      esp: USER_STACK_BASE - 12,
      eflags: 0x00000202,
      cs: 0x23,
      eip: 0x08048422
    },
    stepDescription:
      "L'hardware della CPU esegue atomicamente: 1) Legge esp0 e ss0 dal TSS; 2) Commuta lo stack al Kernel Stack; 3) Inserisce sullo stack kernel il Trap Frame (ss, esp, eflags, cs, eip); 4) Imposta CPL=0; 5) Salta all'indirizzo in IDT[0x80].",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" },
      { address: USER_STACK_BASE - 12, value: "0x08049000 (buf pointer)" }
    ],
    kernelStack: [
      { address: KERNEL_STACK_BASE - 4, value: "0x0000002B (User SS)" },
      { address: KERNEL_STACK_BASE - 8, value: `0x${(USER_STACK_BASE - 12).toString(16)} (User ESP)` },
      { address: KERNEL_STACK_BASE - 12, value: "0x00000202 (EFLAGS)" },
      { address: KERNEL_STACK_BASE - 16, value: "0x00000023 (User CS)" },
      { address: KERNEL_STACK_BASE - 20, value: "0x08048422 (Return EIP)" }
    ]
  },
  {
    stepIndex: 5,
    stageName: "Entry Handler Kernel & Salvataggio Registri (SAVE_ALL)",
    cpl: 0,
    currentInstruction: "pusha ; push ds ; push es ; call sys_call_table[eax]",
    stackPointer: USER_STACK_BASE - 12,
    kernelStackPointer: KERNEL_STACK_BASE - 56,
    savedTrapFrame: {
      ss: 0x2b,
      esp: USER_STACK_BASE - 12,
      eflags: 0x00000202,
      cs: 0x23,
      eip: 0x08048422
    },
    stepDescription:
      "Il kernel riceve il controllo a CPL=0. L'handler archivia tutti i registri general-purpose sullo stack o nel PCB (Process Control Block) per non corrompere lo stato utente.",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" },
      { address: USER_STACK_BASE - 12, value: "0x08049000 (buf pointer)" }
    ],
    kernelStack: [
      { address: KERNEL_STACK_BASE - 4, value: "0x0000002B (User SS)" },
      { address: KERNEL_STACK_BASE - 8, value: `0x${(USER_STACK_BASE - 12).toString(16)} (User ESP)` },
      { address: KERNEL_STACK_BASE - 12, value: "0x00000202 (EFLAGS)" },
      { address: KERNEL_STACK_BASE - 16, value: "0x00000023 (User CS)" },
      { address: KERNEL_STACK_BASE - 20, value: "0x08048422 (Return EIP)" },
      { address: KERNEL_STACK_BASE - 24, value: "0x00000004 (EAX syscall #4)" },
      { address: KERNEL_STACK_BASE - 28, value: "0x00000001 (EBX fd=1)" },
      { address: KERNEL_STACK_BASE - 32, value: "0x08049000 (ECX buf)" },
      { address: KERNEL_STACK_BASE - 36, value: "0x0000000E (EDX len=14)" }
    ]
  },
  {
    stepIndex: 6,
    stageName: "Esecuzione della Routine Kernel (sys_write)",
    cpl: 0,
    currentInstruction: "sys_write(fd=1, buf=0x08049000, count=14)",
    stackPointer: USER_STACK_BASE - 12,
    kernelStackPointer: KERNEL_STACK_BASE - 56,
    savedTrapFrame: {
      ss: 0x2b,
      esp: USER_STACK_BASE - 12,
      eflags: 0x00000202,
      cs: 0x23,
      eip: 0x08048422
    },
    stepDescription:
      "Il kernel convalida i parametri utente, verifica che il puntatore del buffer sia valido e non invada la memoria del kernel, invia i caratteri al driver del terminale e scrive il risultato (byte scritti) in EAX.",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" },
      { address: USER_STACK_BASE - 12, value: "0x08049000 (buf pointer)" }
    ],
    kernelStack: [
      { address: KERNEL_STACK_BASE - 4, value: "0x0000002B (User SS)" },
      { address: KERNEL_STACK_BASE - 8, value: `0x${(USER_STACK_BASE - 12).toString(16)} (User ESP)` },
      { address: KERNEL_STACK_BASE - 12, value: "0x00000202 (EFLAGS)" },
      { address: KERNEL_STACK_BASE - 16, value: "0x00000023 (User CS)" },
      { address: KERNEL_STACK_BASE - 20, value: "0x08048422 (Return EIP)" },
      { address: KERNEL_STACK_BASE - 24, value: "0x0000000E (Retval in EAX: 14)" }
    ]
  },
  {
    stepIndex: 7,
    stageName: "Ripristino Registri e Istruzione iret",
    cpl: 0,
    currentInstruction: "popa ; pop ds ; iret",
    stackPointer: USER_STACK_BASE - 12,
    kernelStackPointer: KERNEL_STACK_BASE - 20,
    savedTrapFrame: {
      ss: 0x2b,
      esp: USER_STACK_BASE - 12,
      eflags: 0x00000202,
      cs: 0x23,
      eip: 0x08048422
    },
    stepDescription:
      "Il kernel ripristina i registri general-purpose dallo stack. Rimane solo il Trap Frame in cima al kernel stack. Viene invocata l'istruzione speciale privilegiata 'iret'.",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" },
      { address: USER_STACK_BASE - 12, value: "0x08049000 (buf pointer)" }
    ],
    kernelStack: [
      { address: KERNEL_STACK_BASE - 4, value: "0x0000002B (User SS)" },
      { address: KERNEL_STACK_BASE - 8, value: `0x${(USER_STACK_BASE - 12).toString(16)} (User ESP)` },
      { address: KERNEL_STACK_BASE - 12, value: "0x00000202 (EFLAGS)" },
      { address: KERNEL_STACK_BASE - 16, value: "0x00000023 (User CS)" },
      { address: KERNEL_STACK_BASE - 20, value: "0x08048422 (Return EIP)" }
    ]
  },
  {
    stepIndex: 8,
    stageName: "Ritorno in User Mode a CPL = 3",
    cpl: 3,
    currentInstruction: "test eax, eax ; jnz handle_error ; resume app",
    stackPointer: USER_STACK_BASE - 12,
    kernelStackPointer: KERNEL_STACK_BASE,
    savedTrapFrame: null,
    stepDescription:
      "La CPU esegue atomicamente 'iret': estrae dal kernel stack EIP, CS, EFLAGS, ESP e SS, commuta CPL a 3 e riprende l'esecuzione del programma utente dall'istruzione immediatamente successiva a 'int 0x80'.",
    userStack: [
      { address: USER_STACK_BASE, value: "0x00000000 (argc)" },
      { address: USER_STACK_BASE - 4, value: "0x00000000 (argv)" },
      { address: USER_STACK_BASE - 8, value: "0x08048400 (main entry)" },
      { address: USER_STACK_BASE - 12, value: "0x08049000 (buf pointer)" }
    ],
    kernelStack: []
  }
];

export function simulateLdeProtocol(): HardwarePrivilegeState[] {
  return [...LDE_STEPS];
}

export function getLdeStep(stepIndex: number): HardwarePrivilegeState {
  const boundedIndex = Math.max(0, Math.min(stepIndex, LDE_STEPS.length - 1));
  const step = LDE_STEPS[boundedIndex] ?? LDE_STEPS[0];
  if (!step) {
    throw new Error("LDE steps not initialized.");
  }
  return step;
}
