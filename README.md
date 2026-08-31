#How to play
Use the Live Server extension by Ritwick Dey in VSCode to go live when in the file index.html or play directly on www.pledle.ch (now works on desktop & mobile).

#Word list
The word list in the background is currently very sparse and only the Vallader version is playable. Each language in words.js contains two lists: SOLUTIONS and VALID_GUESSES. The latter are words which can be guessed when playing the game and the former (a subset) are possible solution words. SOLUTIONS should only contain proper words, no plural words, conjugated verbs or participles. By default SOLUTIONS always is contained in VALID_GUESSES. When running the game, a random word from SOLUTIONS is picked as the solution. Currently the solution list contains a small selection of words from Lecziun 1.

Please add new words to VALID_GUESSES first, we then choose which words should be valid solutions later. You need not worrying about duplicates, as the code doesn't care. :)

#Amo da far
Number of guesses / letters can be changed in script.js but to have any letter words the code needs to be adapted further so that it picks guess / solution words from a distinct lists.
I want to change it so that every player plays the same game on any given day (or maybe a smaller unit of time so that it can be played more often).