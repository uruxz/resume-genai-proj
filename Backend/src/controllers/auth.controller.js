const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")


async function registerUser(req, res) {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" })
        }
        const isUserExist = await userModel.findOne({ $or: [{ username }, { email }] })
        if (isUserExist) {
            return res.status(400).json({ message: "User already exists" })
        }
        const hash = await bcrypt.hash(password, 10);
        const user = await userModel.create({
            username,
            email,
            password: hash
        })
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" })
        res.cookie("token", token).status(201).json({ message: "User registered successfully", user: { id: user._id, username: user.username, email: user.email } })
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({ message: "Error registering user", error: error.message })
    }
}
// logging in user and generating token for authentication

async function loginUserController(req, res) {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" })
        }

        const user = await userModel.findOne({ email })

        if (!user) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const isPasswordValid = await bcrypt.compare(password, user.password)

        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        )

        res.cookie("token", token)
        res.status(200).json({
            message: "User loggedIn successfully.",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Error logging in", error: error.message })
    }
}

async function logoutUserController(req, res) {
    const token  = req.cookies.token;
    if(token){
        await tokenBlacklistModel.create({ token })
    }
    res.clearCookie("token").status(200).json({ message: "User logged out successfully" })
}

async function getMeController(req, res) {
        const user = await userModel.findById(req.user.id)
        res.status(200).json({ message: "User detailed fetched successfully",
             user: { id: user._id, 
                username: user.username, 
                email: user.email }
             })
}


module.exports = {
    registerUser,loginUserController,logoutUserController,getMeController
}