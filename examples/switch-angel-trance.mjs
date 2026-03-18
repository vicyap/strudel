// Adapted from Switch Angel's trance live coding session.
// Translated from acidenv() to native Strudel filter envelope API.

// Lead melody - sawtooth arp with acid filter envelope + delay
$: n("<0 4 0 9 7>*16".add("<7 _ _ 6 5 _ _ 6>*2")).scale("g:minor")
  .o(3).s("sawtooth")
  .lpf(600).lpenv(7).lpa(0.005).lpd(0.15).lps(0).lpq(12).ftype('ladder')
  .delay(.4)

// Bass pad - supersaw, transposed down 2 octaves, random detune
$: n("<7 _ _ 6 5 _ <5 3> <6 4>>*2").scale("g:minor").transpose(-24)
  .detune(rand)
  .o(4).s("supersaw")
  .lpf(600).lpenv(8).lpa(0.005).lpd(0.15).lps(0).lpq(12).ftype('ladder')

// Percussion - clap loop
$: s("jcp:9!4").o(8)

// Percussion - break loop fitted to cycle
$: s("top:1/2!").fit().o(5)
